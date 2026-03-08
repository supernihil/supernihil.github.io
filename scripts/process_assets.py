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

    # 1. Gather all in-use assets
    in_use_screenshots = set()
    in_use_thumbnails = set()
    
    # Files to always keep
    protected_files = {'hedo.png'}

    for post_file in os.listdir(posts_dir):
        if not post_file.endswith(".md"):
            continue
            
        post_path = os.path.join(posts_dir, post_file)
        slug = get_slug(post_file)
        
        with open(post_path, 'r', encoding='utf-8') as f:
            content = f.read()

        match = re.search(r'^cover:\s*(.*)$', content, re.MULTILINE)
        if not match:
            continue
            
        current_cover_rel = match.group(1).strip().strip('"').strip("'")
        if not current_cover_rel.startswith('/assets/screenshots/'):
            continue
            
        current_filename = os.path.basename(current_cover_rel)
        source_path = os.path.join(screenshots_dir, current_filename)
        
        # Skip if file is already a ".done" version
        if ".done." in current_filename:
            in_use_screenshots.add(current_filename)
            # Mark its corresponding thumbnail as in-use
            ext = os.path.splitext(current_filename)[1].lower()
            thumb_name = f"{slug}.thumb.done{ext}"
            in_use_thumbnails.add(thumb_name)
            
            # Ensure thumbnail exists
            thumb_path = os.path.join(thumbnails_dir, thumb_name)
            if not os.path.exists(thumb_path) and os.path.exists(source_path):
                is_gif = ext == '.gif'
                process_image(source_path, thumb_path, 300, is_gif)
                print(f"Repaired missing thumbnail for {slug}")
            continue

        if not os.path.exists(source_path):
            continue

        # Process new/unprocessed files
        ext = os.path.splitext(current_filename)[1].lower()
        is_gif = ext == '.gif'
        target_ext = ".gif" if is_gif else ".jpg"
        
        done_filename = f"{slug}.done{target_ext}"
        thumb_filename = f"{slug}.thumb.done{target_ext}"
        
        final_screenshot_path = os.path.join(screenshots_dir, done_filename)
        final_thumbnail_path = os.path.join(thumbnails_dir, thumb_filename)

        print(f"Processing: {current_filename} -> {done_filename}")
        process_image(source_path, final_screenshot_path, 900, is_gif)
        process_image(source_path, final_thumbnail_path, 300, is_gif)

        new_cover_path = f"/assets/screenshots/{done_filename}"
        new_content = content.replace(f"cover: {current_cover_rel}", f"cover: {new_cover_path}")
        new_content = new_content.replace(f"image: {current_cover_rel}", f"image: {new_cover_path}")
        
        with open(post_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        
        in_use_screenshots.add(done_filename)
        in_use_thumbnails.add(thumb_filename)

        if source_path != final_screenshot_path:
            os.remove(source_path)

    # 2. Cleanup unused screenshots
    for filename in os.listdir(screenshots_dir):
        if filename not in in_use_screenshots and filename not in protected_files:
            file_path = os.path.join(screenshots_dir, filename)
            if os.path.isfile(file_path):
                os.remove(file_path)
                print(f"Deleted unused screenshot: {filename}")

    # 3. Cleanup unused thumbnails
    for filename in os.listdir(thumbnails_dir):
        if filename not in in_use_thumbnails:
            file_path = os.path.join(thumbnails_dir, filename)
            if os.path.isfile(file_path):
                os.remove(file_path)
                print(f"Deleted unused thumbnail: {filename}")

if __name__ == "__main__":
    run_pipeline()
