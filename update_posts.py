import os
import re
import yaml

posts_dir = '/home/nihil/Documents/supernihil.github.io/_posts'

label_replacements = {
    'Original Source': 'website',
    'Website': 'website',
    'Video': 'video'
}

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Split frontmatter and body
    parts = re.split(r'^---\s*$', content, flags=re.MULTILINE)
    if len(parts) < 3:
        return # Not a standard Jekyll post

    frontmatter_raw = parts[1]
    body = '---'.join(parts[2:])

    # Apply label replacements in frontmatter_raw
    # We want to be careful to only replace inside the 'links' section if possible, 
    # but the instruction says "inside the 'links' list".
    # Since 'label: ...' is likely only in links, a global replace in frontmatter might be okay.
    
    new_frontmatter_raw = frontmatter_raw
    for old, new in label_replacements.items():
        new_frontmatter_raw = re.sub(f'label: {old}', f'label: {new}', new_frontmatter_raw)
    
    # Ensure repo, article, event are lowercase
    for label in ['repo', 'article', 'event', 'website', 'video']:
        # This matches "label: Repo" or "label: REPO" etc and replaces with "label: repo"
        new_frontmatter_raw = re.sub(f'label: {label}', f'label: {label}', new_frontmatter_raw, flags=re.IGNORECASE)

    # Parse frontmatter to check for video_url
    try:
        data = yaml.safe_load(new_frontmatter_raw)
    except Exception as e:
        print(f"Error parsing YAML in {filepath}: {e}")
        return

    if data and 'links' in data:
        video_link = None
        for link in data['links']:
            if isinstance(link, dict) and link.get('label') == 'video':
                video_link = link.get('url')
                break
        
        if video_link and 'video_url' not in data:
            # Add video_url to the raw frontmatter to preserve formatting
            # We'll just append it before the closing ---
            if not new_frontmatter_raw.strip().endswith('\n'):
                new_frontmatter_raw += '\n'
            new_frontmatter_raw += f'video_url: {video_link}\n'
            print(f"Added video_url to {filepath}")

    # Reconstruct content
    new_content = f"---{new_frontmatter_raw}---{body}"
    
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

for filename in os.listdir(posts_dir):
    if filename.endswith('.md'):
        process_file(os.path.join(posts_dir, filename))
