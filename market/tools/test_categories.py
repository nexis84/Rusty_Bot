#!/usr/bin/env python3
import re

with open('../categories.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Check for SubCategories.blueprints
match = re.search(r'blueprints:\s*\{', content)
if match:
    print('Found blueprints key in SubCategories')
    # Extract the groups array
    start = content.find('blueprints: {')
    # Find the closing of this object
    brace_count = 0
    in_string = False
    string_char = None
    i = start
    while i < len(content):
        c = content[i]
        if not in_string:
            if c == '"' or c == "'":
                in_string = True
                string_char = c
            elif c == '{':
                brace_count += 1
            elif c == '}':
                brace_count -= 1
                if brace_count == 0:
                    section = content[start:i+1]
                    # Count groups - look for id: "something" or id: 'something' patterns
                    groups = re.findall(r"id:\s*['\"]([^'\"]+)['\"][^}]+name:\s*['\"]([^'\"]+)['\"]", section)
                    print(f'Found {len(groups)} groups in blueprints section')
                    for g in groups:
                        print(f'  - {g[1]} ({g[0]})')
                    break
        else:
            if c == string_char and content[i-1] != '\\':
                in_string = False
        i += 1
else:
    print('blueprints key NOT found')
