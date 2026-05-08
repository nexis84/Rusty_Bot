import json, sys
p = r"C:\Users\nexis\Desktop\Rusty_Bot-main\ship-guess-game\data\ships.json"
try:
    with open(p, 'r', encoding='utf-8') as f:
        json.load(f)
    print('OK: valid JSON')
except Exception as e:
    print('ERROR:', type(e).__name__, e)
    sys.exit(2)
