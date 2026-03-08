import os
import re
import subprocess
import shutil
from PIL import Image

def get_slug(filename):
    return re.sub(r'^\d{4}-\d{2}-\d{2}-', '', filename).replace('.md', '')

def process_image(source_path, target_path, max_width, is_gif):
    aspect_ratio = 1.0
    if is_gif:
        try:
            subprocess.run(
                ["gifsicle", "--resize-width", str(max_width), "--optimize=3", source_path, "-o", target_path],
                check=True, capture_output=True
            )
            with Image.open(target_path) as img:
                aspect_ratio = round(img.width / img.height, 3)
        except:
            shutil.copy2(source_path, target_path)
            with Image.open(source_path) as img:
                aspect_ratio = round(img.width / img.height, 3)
    else:
        with Image.open(source_path) as img:
            ratio = img.width / img.height
            new_height = int(max_width / ratio)
            img.thumbnail((max_width, new_height), Image.Resampling.LANCZOS)
            if img.mode in ("RGBA", "P", "LA"):
                bg = Image.new("RGB", img.size, (255, 255, 255))
                bg.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
                img = bg
            img.convert("RGB").save(target_path, "JPEG", quality=90, optimize=True)
            aspect_ratio = round(img.width / img.height, 3)
    return aspect_ratio

def update_frontmatter(content, slug, done_filename, thumb_filename, aspect_ratio):
    new_cover = f"/assets/screenshots/{done_filename}"
    new_thumb = f"/assets/thumbnails/{thumb_filename}"
    
    # Update or add cover
    if "cover:" in content:
        content = re.sub(r'^cover:.*$', f'cover: {new_cover}', content, flags=re.MULTILINE)
    else:
        content = content.replace("---\n", f"---\ncover: {new_cover}\n", 1)
        
    # Update or add thumbnail
    if "thumbnail:" in content:
        content = re.sub(r'^thumbnail:.*$', f'thumbnail: {new_thumb}', content, flags=re.MULTILINE)
    else:
        content = content.replace("---\n", f"---\nthumbnail: {new_thumb}\n", 1)

    # Update or add aspect_ratio
    if "aspect_ratio:" in content:
        content = re.sub(r'^aspect_ratio:.*$', f'aspect_ratio: {aspect_ratio}', content, flags=re.MULTILINE)
    else:
        content = content.replace("---\n", f"---\naspect_ratio: {aspect_ratio}\n", 1)
        
    # Update or add image (SEO)
    if "image:" in content:
        content = re.sub(r'^image:.*$', f'image: {new_cover}', content, flags=re.MULTILINE)
    else:
        content = content.replace("---\n", f"---\nimage: {new_cover}\n", 1)
        
    return content

def run_pipeline():
    posts_dir = "_posts"
    screenshots_dir = "assets/screenshots"
    thumbnails_dir = "assets/thumbnails"
    
    if not os.path.exists(thumbnails_dir):
        os.makedirs(thumbnails_dir)

    in_use_screenshots = set()
    in_use_thumbnails = set()
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
        
        ext = os.path.splitext(current_filename)[1].lower()
        is_gif = ext == '.gif' or ('.done.gif' in current_filename)
        target_ext = ".gif" if is_gif else ".jpg"
        done_filename = f"{slug}.done{target_ext}"
        thumb_filename = f"{slug}.thumb.done{target_ext}"
        final_screenshot_path = os.path.join(screenshots_dir, done_filename)
        final_thumbnail_path = os.path.join(thumbnails_dir, thumb_filename)

        if ".done." in current_filename:
            in_use_screenshots.add(current_filename)
            in_use_thumbnails.add(thumb_filename)
            
            ratio = 1.0
            if os.path.exists(final_thumbnail_path):
                with Image.open(final_thumbnail_path) as img:
                    ratio = round(img.width / img.height, 3)
            elif os.path.exists(source_path):
                ratio = process_image(source_path, final_thumbnail_path, 300, is_gif)
            
            if "thumbnail:" not in content or "aspect_ratio:" not in content:
                new_content = update_frontmatter(content, slug, current_filename, thumb_filename, ratio)
                with open(post_path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
            continue

        if not os.path.exists(source_path):
            continue

        print(f"Optimizing Assets with Aspect Ratio: {slug}")
        # Original (just for ratio/rename)
        process_image(source_path, final_screenshot_path, 900, is_gif)
        # Thumbnail
        ratio = process_image(source_path, final_thumbnail_path, 300, is_gif)

        new_content = update_frontmatter(content, slug, done_filename, thumb_filename, ratio)
        with open(post_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        
        in_use_screenshots.add(done_filename)
        in_use_thumbnails.add(thumb_filename)

        if source_path != final_screenshot_path:
            os.remove(source_path)

    # Cleanup
    for filename in os.listdir(screenshots_dir):
        if filename not in in_use_screenshots and filename not in protected_files:
            os.remove(os.path.join(screenshots_dir, filename))
    for filename in os.listdir(thumbnails_dir):
        if filename not in in_use_thumbnails:
            os.remove(os.path.join(thumbnails_dir, filename))

if __name__ == "__main__":
    run_pipeline()
