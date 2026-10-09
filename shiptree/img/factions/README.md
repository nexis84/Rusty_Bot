# Faction logos

The lane backgrounds use a house emblem by default (faction colour + initials),
because **CCP does not expose faction logos on `images.evetech.net`** — the
`/factions/...` routes return 400 and the SDE only stores client-side `res:/`
texture paths (`res:/UI/Texture/Classes/ShipTree/factions/caldari.png`).

To use the real in-game emblems:

1. Export the textures from the EVE client (or grab them however you like) and
   save each as a PNG named after its lane id:

   | lane id | file | faction |
   |---|---|---|
   | 500001 | `500001.png` | Caldari State |
   | 500002 | `500002.png` | Minmatar Republic |
   | 500003 | `500003.png` | Amarr Empire |
   | 500004 | `500004.png` | Gallente Federation |
   | 500010 | `500010.png` | Guristas Pirates |
   | 500011 | `500011.png` | Angel Cartel |
   | 500012 | `500012.png` | Blood Raider Covenant |
   | 500019 | `500019.png` | Sansha's Nation |
   | 500020 | `500020.png` | Serpentis |
   | 500018 | `500018.png` | Mordu's Legion |
   | 500017 | `500017.png` | SoCT |
   | 500016 | `500016.png` | Servant Sisters of EVE |
   | 500029 | `500029.png` | Deathless Circle |
   | 500014 | `500014.png` | ORE |
   | 500026 | `500026.png` | Triglavian Collective |
   | 500027 | `500027.png` | EDENCOM |
   | 500006 | `500006.png` | CONCORD Assembly |

   Transparent PNG, roughly square, ~256px is plenty (it is drawn at 140px).

2. List the lane ids you added in `manifest.json`, e.g.:

   ```json
   [500001, 500002, 500003, 500004]
   ```

Anything not listed keeps the house emblem, so you can add them a few at a time.
