import os
import re

backend_dir = 'backend'

for root, _, files in os.walk(backend_dir):
    for file in files:
        if file.endswith('.py'):
            filepath = os.path.join(root, file)
            with open(filepath, 'r') as f:
                content = f.read()
            
            # Use regex to find `except ...: pass\n    ` or `else: pass\n    ` and remove ` pass`
            new_content = re.sub(r'(except(?: [^:]+)?:\s*)pass[ \t]*\n([ \t]+[^\s])', r'\1\n\2', content)
            new_content = re.sub(r'(else:\s*)pass[ \t]*\n([ \t]+[^\s])', r'\1\n\2', new_content)
            
            # Wait, my previous regex caused an issue in bot.py because `print` had *less* indent than `except`? No!
            # The issue in bot.py was that `if not WEBAPP_URL:\n` was followed by an EMPTY line, and then `bot = Bot(...)` which had NO indent.
            # My regex didn't break `bot.py`! The previous `bot.py` just had `if not WEBAPP_URL:\n\nbot = ...` before I even touched it!
            # Let me just run this regex safely on all files.
            
            if new_content != content:
                with open(filepath, 'w') as f:
                    f.write(new_content)
                print(f"Fixed {filepath}")
