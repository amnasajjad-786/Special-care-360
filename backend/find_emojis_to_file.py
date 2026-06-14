import os
import re

# Regex to match emojis
# Ranges cover standard emojis, symbols, and pictographs
emoji_pattern = re.compile(
    r'[\U00010000-\U0010ffff]|[\u2600-\u27ff]|[\u3000-\u303f]|[\u2000-\u206f]|[\u20a0-\u20cf]'
)

frontend_dir = "c:\\FAST\\Web_Programming\\Project\\Special-care-360\\frontend"
output_file = "c:\\FAST\\Web_Programming\\Project\\Special-care-360\\backend\\emoji_locations.txt"

print("Scanning and writing to backend/emoji_locations.txt...")

with open(output_file, "w", encoding="utf-8") as out:
    out.write("=== EMOJI LOCATIONS IN FRONTEND ===\n")
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
                    
                    lines = content.splitlines()
                    found = False
                    for idx, line in enumerate(lines):
                        matches = emoji_pattern.findall(line)
                        if matches:
                            filtered_matches = [m for m in matches if ord(m) > 127 and ord(m) not in [8217, 8211, 8226, 8360]]
                            if filtered_matches:
                                if not found:
                                    out.write(f"\nFile: {os.path.relpath(filepath, frontend_dir)}\n")
                                    found = True
                                out.write(f"  Line {idx+1}: {line.strip()}\n")
                except Exception as e:
                    out.write(f"Error reading {filepath}: {e}\n")

print("Done! Check backend/emoji_locations.txt.")
