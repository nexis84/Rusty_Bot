# Ship Guess Game - Update Log

## January 25, 2026 - Data Update

### Summary
Updated the ship database from EVE Online's latest static data export (January 2026).

### Changes

#### Ship Database Update
- **Source**: EVE Online Static Data Export (January 2026)
- **Previous**: 5,022 ships (included unpublished/test ships)
- **Updated**: 412 published, playable ships
- **Data Quality**: Cleaned HTML tags from bonus descriptions

#### New Ship Distribution

**By Race:**
- Amarr: 85 ships
- Caldari: 87 ships
- Gallente: 93 ships
- Minmatar: 78 ships
- ORE: 20 ships
- Pirate Factions: 13 ships
- Triglavian: 14 ships
- Jove: 7 ships
- Upwell: 7 ships
- Unknown: 8 ships

**By Class (Top 10):**
1. Frigate: 51
2. Cruiser: 38
3. Battleship: 35
4. Combat Battlecruiser: 21
5. Destroyer: 20
6. Hauler: 18
7. Assault Frigate: 15
8. Heavy Assault Cruiser: 14
9. Dreadnought: 13
10. Shuttle: 11

### Files Modified
- `data/ships.json` - Complete replacement with new data

### Files Created
- `update_ships.py` - Python script to extract ship data from static dump
- `UPDATE_LOG.md` - This file

### Technical Details

The update script (`update_ships.py`) processes the following data files:
- `categories.jsonl` - Identifies ship category
- `groups.jsonl` - Ship group classifications
- `types.jsonl` - Individual ship data (50MB+ file)
- `typeBonus.jsonl` - Ship bonus information
- `races.jsonl` - Race information

### Game Impact
- More accurate ship pool (only playable ships)
- Updated ship bonuses reflecting latest balance changes
- Includes new ships added since last update
- Better data quality with cleaned bonus text

### How to Update Again in Future

1. Download latest EVE Online static data export from: https://developers.eveonline.com/static-data
2. Extract to `Static Dump/` folder
3. Update path in `update_ships.py` if needed
4. Run: `python update_ships.py`
5. Test game at http://localhost:8080

### Notes
- The significant reduction in ship count (5,022 → 412) is due to filtering out:
  - Unpublished ships
  - Test/debug ships
  - Duplicate entries
  - Non-player ships (NPCs, structures, etc.)
- All 412 ships in the new database are fully playable ships available in EVE Online
