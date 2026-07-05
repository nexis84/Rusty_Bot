const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

function getAdminIds() {
  const raw = process.env.ADMIN_CHARACTER_IDS || '';
  return raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
}

function isAdmin(characterId) {
  return getAdminIds().includes(characterId);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'));
    }
  }
});

function decodeJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = authHeader.slice(7);
  const decoded = decodeJWT(token);
  if (!decoded || !decoded.sub) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  const characterId = decoded.sub.split(':').pop();
  const characterName = decoded.name || 'Unknown';
  if (!characterId) {
    return res.status(401).json({ error: 'Could not extract character ID from token' });
  }
  req.characterId = parseInt(characterId, 10);
  req.characterName = characterName;
  next();
}

async function uploadImagesToSupabase(files, characterId) {
  const urls = [];
  for (const file of files) {
    const ext = path.extname(file.originalname) || '.png';
    const fileName = `${characterId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('skins')
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });
    if (uploadError) throw new Error('Storage upload failed: ' + uploadError.message);
    const { data: publicUrlData } = supabase.storage.from('skins').getPublicUrl(fileName);
    urls.push(publicUrlData.publicUrl);
  }
  return urls;
}

// List skins (public by default; owner sees their own private ones)
router.get('/skins', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    const { search, ship, author, sort, page, limit, character_id } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    let query = supabase
      .from('skins')
      .select('*', { count: 'exact' });

    if (search) {
      query = query.or(`skin_name.ilike.%${search}%,ship_name.ilike.%${search}%,character_name.ilike.%${search}%`);
    }
    if (ship) {
      query = query.ilike('ship_name', `%${ship}%`);
    }
    if (author) {
      query = query.ilike('character_name', `%${author}%`);
    }

    if (character_id) {
      query = query.eq('character_id', parseInt(character_id));
    } else {
      query = query.eq('visibility', 'public');
    }

    const sortField = sort === 'oldest' ? 'created_at' : 'created_at';
    const sortOrder = sort === 'oldest' ? { ascending: true } : { ascending: false };

    const { data, count, error } = await query
      .order(sortField, sortOrder)
      .range(offset, offset + limitNum - 1);

    if (error) throw error;

    res.json({
      skins: data || [],
      total: count || 0,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil((count || 0) / limitNum)
    });
  } catch (err) {
    console.error('[skins] GET /skins error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/skins/:id', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    const { data, error } = await supabase
      .from('skins')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Skin not found' });
      }
      throw error;
    }

    res.json(data);
  } catch (err) {
    console.error('[skins] GET /skins/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Create skin — supports single 'image' field or 'images' array (up to 5)
router.post('/skins', authMiddleware, upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'images', maxCount: 3 }
]), async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { ship_name, skin_name, description, visibility } = req.body;
    const vis = visibility === 'private' ? 'private' : 'public';

    if (!ship_name || !skin_name) {
      return res.status(400).json({ error: 'ship_name and skin_name are required' });
    }

    const files = req.files?.image || req.files?.images || [];
    if (!files.length) {
      return res.status(400).json({ error: 'At least one image is required' });
    }

    const urls = await uploadImagesToSupabase(files, req.characterId);

    const screenshots = urls.slice(1);

    const { data: skinData, error: dbError } = await supabase
      .from('skins')
      .insert({
        character_id: req.characterId,
        character_name: req.characterName,
        ship_name: ship_name.trim(),
        skin_name: skin_name.trim(),
        description: (description || '').trim(),
        image_url: urls[0],
        screenshots: screenshots,
        visibility: vis
      })
      .select()
      .single();

    if (dbError) {
      for (const url of urls) {
        const fn = url.split('/').pop();
        await supabase.storage.from('skins').remove([fn]).catch(() => {});
      }
      throw new Error('Database insert failed: ' + dbError.message);
    }

    res.status(201).json(skinData);
  } catch (err) {
    console.error('[skins] POST /skins error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Edit skin
router.put('/skins/:id', authMiddleware, upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'images', maxCount: 3 }
]), async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { data: skin, error: fetchError } = await supabase
      .from('skins')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchError) {
      return res.status(404).json({ error: 'Skin not found' });
    }
    if (skin.character_id !== req.characterId) {
      return res.status(403).json({ error: 'You can only edit your own skins' });
    }

    const { ship_name, skin_name, description, visibility, remove_screenshots } = req.body;

    const updates = {};

    if (ship_name !== undefined) updates.ship_name = ship_name.trim();
    if (skin_name !== undefined) updates.skin_name = skin_name.trim();
    if (description !== undefined) updates.description = description.trim();
    if (visibility !== undefined) updates.visibility = ['public', 'private'].includes(visibility) ? visibility : skin.visibility;

    let currentScreenshots = skin.screenshots || [];

    if (remove_screenshots) {
      const toRemove = Array.isArray(remove_screenshots) ? remove_screenshots : [remove_screenshots];
      for (const url of toRemove) {
        const fn = url.split('/').pop();
        await supabase.storage.from('skins').remove([fn]).catch(() => {});
      }
      currentScreenshots = currentScreenshots.filter(u => !toRemove.includes(u));
    }

    const files = req.files?.image || req.files?.images || [];
    if (files.length) {
      const newUrls = await uploadImagesToSupabase(files, req.characterId);
      if (req.files?.image) {
        const oldFn = skin.image_url.split('/').pop();
        await supabase.storage.from('skins').remove([oldFn]).catch(() => {});
        updates.image_url = newUrls[0];
        currentScreenshots = [...currentScreenshots, ...newUrls.slice(1)];
      } else {
        currentScreenshots = [...currentScreenshots, ...newUrls];
      }
    }

    updates.screenshots = currentScreenshots;

    const { data, error } = await supabase
      .from('skins')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('[skins] PUT /skins/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/skins/:id', authMiddleware, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { data: skin, error: fetchError } = await supabase
      .from('skins')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchError) {
      return res.status(404).json({ error: 'Skin not found' });
    }
    if (skin.character_id !== req.characterId && !isAdmin(req.characterId)) {
      return res.status(403).json({ error: 'You can only delete your own skins' });
    }

    const allUrls = [skin.image_url, ...(skin.screenshots || [])];
    for (const url of allUrls) {
      const fn = url.split('/').pop();
      await supabase.storage.from('skins').remove([fn]).catch(() => {});
    }

    const { error: deleteError } = await supabase
      .from('skins')
      .delete()
      .eq('id', req.params.id);

    if (deleteError) throw deleteError;

    res.json({ message: 'Skin deleted' });
  } catch (err) {
    console.error('[skins] DELETE /skins/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/skins/:id/like', authMiddleware, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { data: skin, error: fetchError } = await supabase
      .from('skins')
      .select('id, likes')
      .eq('id', req.params.id)
      .single();

    if (fetchError) {
      return res.status(404).json({ error: 'Skin not found' });
    }

    const newLikes = (skin.likes || 0) + 1;

    const { data, error } = await supabase
      .from('skins')
      .update({ likes: newLikes })
      .eq('id', req.params.id)
      .select('likes')
      .single();

    if (error) throw error;

    res.json({ likes: data.likes });
  } catch (err) {
    console.error('[skins] POST /skins/:id/like error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/profile/:characterId', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    const charId = parseInt(req.params.characterId, 10);
    if (isNaN(charId)) {
      return res.status(400).json({ error: 'Invalid character ID' });
    }

    const { data, error } = await supabase
      .from('skins')
      .select('*')
      .eq('character_id', charId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const characterName = data && data.length > 0 ? data[0].character_name : 'Unknown';

    res.json({
      character_id: charId,
      character_name: characterName,
      skin_count: data ? data.length : 0,
      skins: data || []
    });
  } catch (err) {
    console.error('[skins] GET /profile/:characterId error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/config', (req, res) => {
  res.json({
    supabase_configured: !!supabase,
    has_supabase_url: !!process.env.SUPABASE_URL,
    has_supabase_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    eve_client_id: !!process.env.EVE_CLIENT_ID,
    admin_ids: getAdminIds()
  });
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 4MB.' });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Too many files. Maximum is 4 images.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err.message && err.message.includes('Only')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
