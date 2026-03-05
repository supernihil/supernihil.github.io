import os
import yaml

posts_dir = '_posts/'

def update_post_types():
    for filename in os.listdir(posts_dir):
        if not filename.endswith('.md'):
            continue
            
        file_path = os.path.join(posts_dir, filename)
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        parts = content.split('---', 2)
        if len(parts) < 3:
            continue
            
        front_matter_raw = parts[1]
        post_content = parts[2]
        
        try:
            front_matter = yaml.safe_load(front_matter_raw)
        except yaml.YAMLError:
            print(f"Error parsing YAML in {filename}")
            continue
            
        if 'type' not in front_matter:
            # Default to static
            front_matter['type'] = 'static'
            
            new_content = f"""---
{yaml.dump(front_matter, allow_unicode=True, default_flow_style=False).strip()}
---
{post_content}"""
            
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Updated {filename} with type: static")

if __name__ == "__main__":
    update_post_types()
