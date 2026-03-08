import os
import re
import subprocess
import shutil
from PIL import Image

def get_slug(filename):
    # Remove date (YYYY-MM-DD-) and extension
    return re.sub(r'^\d{4}-\d{2}-\d{2}-', '', filename).replace('.md', '')

def process_image(source_path, target_path, max_width, is_gif):
    if is_gif:
        try:
            subprocess.run(
                ["gifsicle", "--resize-width", str(max_width), "--optimize=3", source_path, "-o", target_path],
                check=True, capture_output=True
            )
        except:
            shutil.copy2(source_path, target_path)
    else:
        with Image.open(source_path) as img:
            aspect_ratio = img.height / img.width
            new_height = int(max_width * aspect_ratio)
            img.thumbnail((max_width, new_height), Image.Resampling.LANCZOS)
            if img.mode in ("RGBA", "P", "LA"):
                bg = Image.new("RGB", img.size, (255, 255, 255))
                bg.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
                img = bg
            img.convert("RGB").save(target_path, "JPEG", quality=90, optimize=True)

def run_pipeline():
    posts_dir = "_posts"
    screenshots_dir = "assets/screenshots"
    thumbnails_dir = "assets/thumbnails"
    
    if not os.path.exists(thumbnails_dir):
        os.makedirs(thumbnails_dir)

    for post_file in os.listdir(posts_dir):
        if not post_file.endswith(".md"):
            continue
            
        post_path = os.path.join(posts_dir, post_file)
        slug = get_slug(post_file)
        
        with open(post_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Find cover image path
        match = re.search(r'^cover:\s*(.*)$', content, re.MULTILINE)
        if not match:
            continue
            
        current_cover_rel = match.group(1).strip().strip('"').strip("'")
        if not current_cover_rel.startswith('/assets/screenshots/'):
            continue
            
        current_filename = os.path.basename(current_cover_rel)
        source_path = os.path.join(screenshots_dir, current_filename)
        
        if not os.path.exists(source_path):
            continue

        # Determine desired names
        ext = os.path.splitext(current_filename)[1].lower()
        is_gif = ext == '.gif'
        target_ext = ".gif" if is_gif else ".jpg"
        target_filename = f"{slug}{target_ext}"
        
        final_screenshot_path = os.path.join(screenshots_dir, target_filename)
        final_thumbnail_path = os.path.join(thumbnails_dir, target_filename)

        # 1. Process Original (max 900px)
        temp_path = source_path + ".tmp"
        process_image(source_path, temp_path, 900, is_gif)
        
        # 2. Process Thumbnail (max 300px)
        process_image(source_path, final_thumbnail_path, 300, is_gif)

        # 3. Cleanup & Rename
        # Update frontmatter in the .md file if name changed
        new_cover_path = f"/assets/screenshots/{target_filename}"
        if current_cover_rel != new_cover_path:
            content = content.replace(f"cover: {current_cover_rel}", f"cover: {new_cover_path}")
            content = content.replace(f"image: {current_cover_rel}", f"image: {new_cover_path}")
            with open(post_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"Updated frontmatter for {post_file}")

        # Replace old screenshot with processed version
        if os.path.exists(final_screenshot_path) and final_screenshot_path != source_path:
            os.remove(final_screenshot_path)
        
        os.rename(temp_path, final_screenshot_path)
        
        if source_path != final_screenshot_path:
            os.remove(source_path)
            print(f"Renamed and optimized: {current_filename} -> {target_filename}")
        else:
            print(f"Optimized in-place: {target_filename}")

if __name__ == "__main__":
    run_pipeline()
