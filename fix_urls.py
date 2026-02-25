import os
import re

directory = 'frontend/src'
# Match strings like 'http://localhost:8000/api...' or `http://localhost:8000/api...`
pattern = r"['\"`]http://localhost:8000([^'\"`]*?)['\"`]"

total_replacements = 0

for root, dirs, files in os.walk(directory):
    if 'node_modules' in root: continue
    for file in files:
        if file.endswith(('.js', '.jsx')):
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            def repl(m):
                path = m.group(1)
                # Ensure the path starts with a slash if not empty
                return f"`${{import.meta.env.VITE_API_URL || 'http://localhost:8000'}}{path}`"
            
            new_content, count = re.subn(pattern, repl, content)
            if count > 0:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f'Updated {filepath}: {count} replacements')
                total_replacements += count

print(f"Total urls converted: {total_replacements}")
