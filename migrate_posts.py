import os
import yaml
import re
import shutil

source_dir = '../supernihil/_posts/'
source_assets_dir = '../supernihil/assets/screenshots/'
target_dir = '_posts/'
target_assets_dir = 'assets/screenshots/'

# Ensure target directories exist
os.makedirs(target_dir, exist_ok=True)
os.makedirs(target_assets_dir, exist_ok=True)

# Regex for short and long content
short_re = re.compile(r'<div class="short">(.*?)</div>', re.DOTALL)
long_re = re.compile(r'<div class="long">(.*?)</div>', re.DOTALL)

def migrate_posts():
    for filename in os.listdir(source_dir):
        if not filename.endswith('.md'):
            continue
            
        file_path = os.path.join(source_dir, filename)
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Split front matter and content
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
            
        if front_matter.get('hidden') is not False:
            continue
            
        # Extract fields
        title = front_matter.get('title', '')
        date = front_matter.get('date', '')
        category = front_matter.get('category', '')
        media_path = front_matter.get('media', '')
        links = front_matter.get('links', [])
        
        # Extract short and long content
        short_match = short_re.search(post_content)
        long_match = long_re.search(post_content)
        
        short_text = short_match.group(1).strip() if short_match else ""
        long_text = long_match.group(1).strip() if long_match else ""
        
        # Clean HTML tags from short and long text (simple approach)
        short_text = re.sub(r'<br\s*/?>', '\n', short_text)
        long_text = re.sub(r'<br\s*/?>', '\n', long_text)
        short_text = re.sub(r'<[^>]+>', '', short_text).strip()
        long_text = re.sub(r'<[^>]+>', '', long_text).strip()
        
        # Copy assets
        if media_path:
            # Handle absolute or relative paths
            media_filename = os.path.basename(media_path)
            # Find the actual source file (it might not be exactly where media_path points)
            actual_source_asset = os.path.join(source_assets_dir, media_filename)
            if os.path.exists(actual_source_asset):
                shutil.copy2(actual_source_asset, os.path.join(target_assets_dir, media_filename))
                # Use target path in our front matter
                cover_path = f"/assets/screenshots/{media_filename}"
            else:
                cover_path = media_path # Keep original if not found locally
        else:
            cover_path = ""
            
        # Build new post
        new_front_matter = {
            'layout': 'post',
            'title': title,
            'date': date,
            'category': category,
            'cover': cover_path,
        }
        if links:
            new_front_matter['links'] = links
            
        new_content = f"""---
{yaml.dump(new_front_matter, allow_unicode=True, default_flow_style=False).strip()}
---

{short_text}

<!--more-->

{long_text}
"""
        # Save to target_dir
        with open(os.path.join(target_dir, filename), 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Migrated {filename}")

if __name__ == "__main__":
    migrate_posts()
