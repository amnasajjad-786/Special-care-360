import os
import re

# Regex to match emojis
# Ranges cover standard emojis, symbols, and pictographs
emoji_pattern = re.compile(
    r'[\U00010000-\U0010ffff]|[\u2600-\u27ff]|[\u3000-\u303f]|[\u2000-\u206f]|[\u20a0-\u20cf]'
)

frontend_dir = "c:\\FAST\\Web_Programming\\Project\\Special-care-360\\frontend"

print("--- SCANNING FOR EMOJIS ---")
for root, dirs, files in os.walk(frontend_dir):
    # Skip .next and node_modules
    if ".next" in root or "node_modules" in root:
        continue
    for file in files:
        if file.endswith((".ts", ".tsx")):
            filepath = os.path.join(root, file)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    content = f.read()
                
                # Find all lines with emojis
                lines = content.splitlines()
                found = False
                for idx, line in enumerate(lines):
                    matches = emoji_pattern.findall(line)
                    if matches:
                        # Skip if it is a standard punctuation or common non-emoji symbol covered by range
                        # Let's filter out standard quotes, spaces, currency symbols if needed
                        # but keep actual emojis
                        filtered_matches = [m for m in matches if ord(m) > 127 and ord(m) != 8217 and ord(m) != 8211 and ord(m) != 8226 and ord(m) != 8360]
                        if filtered_matches:
                            if not found:
                                print(f"\nFile: {os.path.relpath(filepath, frontend_dir)}")
                                found = True
                            print(f"  Line {idx+1}: {line.strip()} | Emojis: {filtered_matches}")
            except Exception as e:
                print(f"Error reading {filepath}: {e}")
