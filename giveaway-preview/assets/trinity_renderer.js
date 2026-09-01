/**
 * Trinity Renderer — Particle overlay for existing CSS animations.
 *
 * Canvas is fully cleared each frame (no darkening).
 * Particles are drawn large and bright so they're visible in 1/60s.
 * Canvas is transparent except where particles are drawn.
 */

window.trinityRenderer = (function () {

    var _canvas = null;
    var _ctx = null;
    var _container = null;
    var _cw = 800;
    var _ch = 200;
    var _initialized = false;

    function _init() {
        if (_initialized) return;
        _canvas = document.getElementById('trinity-particle-canvas');
        if (!_canvas) {
            _canvas = document.createElement('canvas');
            _canvas.id = 'trinity-particle-canvas';
            var ac = document.getElementById('animation-content');
            if (ac) ac.appendChild(_canvas);
        }
        _canvas.style.position = 'absolute';
        _canvas.style.top = '0';
        _canvas.style.left = '0';
        _canvas.style.width = '100%';
        _canvas.style.height = '100%';
        _canvas.style.pointerEvents = 'none';
        _canvas.style.zIndex = '5';
        _container = _canvas.parentElement;
        _ctx = _canvas.getContext('2d');
        _resize();
        _initialized = true;
    }

    function _resize() {
        if (!_container) return;
        var rect = _container.getBoundingClientRect();
        if (rect.width > 0) _cw = rect.width;
        if (rect.height > 0) _ch = rect.height;
        if (_canvas) {
            _canvas.width = _cw;
            _canvas.height = _ch;
        }
    }

    function renderTrinityFrame(frameData) {
        if (!frameData) return;
        _init();
        if (!_ctx) return;

        var w = _cw, h = _ch;
        var cx = w / 2, cy = h * 0.35;
        var scaleX = w * 0.4, scaleY = h * 0.3;

        // Full clear — no trail, no darkening
        _ctx.clearRect(0, 0, w, h);

        var particles = frameData.particles;
        if (particles) {
            for (var i = 0; i < particles.length; i++) {
                var p = particles[i];
                var px = cx + (p.x || 0) * scaleX;
                var py = cy + (p.y || 0) * scaleY;

                var r = 0, g = 200, b = 255;
                if (p.color) {
                    var m = p.color.match(/rgba?\((\d+),(\d+),(\d+)/);
                    if (m) { r = +m[1]; g = +m[2]; b = +m[3]; }
                }

                var sz = (p.size || 4) * 1.5;
                // Bright glow
                var glow = _ctx.createRadialGradient(px, py, 0, px, py, sz * 3);
                glow.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0.8)');
                glow.addColorStop(0.5, 'rgba(' + r + ',' + g + ',' + b + ',0.3)');
                glow.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
                _ctx.fillStyle = glow;
                _ctx.beginPath();
                _ctx.arc(px, py, sz * 3, 0, Math.PI * 2);
                _ctx.fill();

                // Bright core
                _ctx.fillStyle = 'rgb(' + Math.min(255, r + 80) + ',' + Math.min(255, g + 80) + ',' + Math.min(255, b + 80) + ')';
                _ctx.beginPath();
                _ctx.arc(px, py, sz * 0.5, 0, Math.PI * 2);
                _ctx.fill();
            }
        }

        // Sound events
        if (frameData.soundEvents && frameData.soundEvents.length > 0) {
            for (var si = 0; si < frameData.soundEvents.length; si++) {
                if (typeof callPythonBackend === 'function') {
                    callPythonBackend('jsRequestSound', frameData.soundEvents[si]);
                }
            }
        }
    }

    function show() {
        _init();
        if (_canvas) _canvas.style.display = '';
    }

    function hide() {
        _init();
        if (_canvas) _canvas.style.display = 'none';
    }

    function clear() {
        if (_ctx) _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    }

    window.addEventListener('resize', _resize);

    return {
        renderTrinityFrame: renderTrinityFrame,
        show: show,
        hide: hide,
        clear: clear
    };

})();

window.renderTrinityFrame = window.trinityRenderer.renderTrinityFrame;
