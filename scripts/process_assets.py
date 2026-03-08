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
            # Use gifsicle for animated/static gifs
            subprocess.run(
                ["gifsicle", "--resize-width", str(max_width), "--optimize=3", source_path, "-o", target_path],
                check=True, capture_output=True
            )
        except:
            # Fallback to copy if gifsicle fails or is missing
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

        # Find cover image path in frontmatter
        match = re.search(r'^cover:\s*(.*)$', content, re.MULTILINE)
        if not match:
            continue
            
        current_cover_rel = match.group(1).strip().strip('"').strip("'")
        if not current_cover_rel.startswith('/assets/screenshots/'):
            continue
            
        current_filename = os.path.basename(current_cover_rel)
        source_path = os.path.join(screenshots_dir, current_filename)
        
        # Skip if file is already a ".done" version (processed)
        if ".done." in current_filename:
            # Check if thumbnail exists, if not create it
            ext = os.path.splitext(current_filename)[1].lower()
            is_gif = ext == '.gif'
            target_thumb_name = f"{slug}.thumb.done{ext}"
            thumb_path = os.path.join(thumbnails_dir, target_thumb_name)
            if not os.path.exists(thumb_path) and os.path.exists(source_path):
                process_image(source_path, thumb_path, 300, is_gif)
                print(f"Repaired missing thumbnail for {slug}")
            continue

        if not os.path.exists(source_path):
            continue

        # Determine target extension and filenames
        ext = os.path.splitext(current_filename)[1].lower()
        is_gif = ext == '.gif'
        target_ext = ".gif" if is_gif else ".jpg"
        
        done_filename = f"{slug}.done{target_ext}"
        thumb_filename = f"{slug}.thumb.done{target_ext}"
        
        final_screenshot_path = os.path.join(screenshots_dir, done_filename)
        final_thumbnail_path = os.path.join(thumbnails_dir, thumb_filename)

        print(f"Processing: {current_filename} -> {done_filename}")

        # 1. Process Original (max 900px)
        process_image(source_path, final_screenshot_path, 900, is_gif)
        
        # 2. Process Thumbnail (max 300px)
        process_image(source_path, final_thumbnail_path, 300, is_gif)

        # 3. Update Frontmatter
        new_cover_path = f"/assets/screenshots/{done_filename}"
        new_content = content.replace(f"cover: {current_cover_rel}", f"cover: {new_cover_path}")
        new_content = new_content.replace(f"image: {current_cover_rel}", f"image: {new_cover_path}")
        
        with open(post_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        
        # 4. Cleanup old original if it was named differently
        if source_path != final_screenshot_path:
            os.remove(source_path)
            print(f"Cleaned up original: {current_filename}")

if __name__ == "__main__":
    run_pipeline()
