import os
from PIL import Image

def generate_thumbnails(source_dir, target_dir, max_width=200):
    if not os.path.exists(target_dir):
        os.makedirs(target_dir)

    for filename in os.listdir(source_dir):
        if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp')):
            source_path = os.path.join(source_dir, filename)
            target_path = os.path.join(target_dir, filename)

            # Skip if thumbnail already exists and is newer than source
            if os.path.exists(target_path) and os.path.getmtime(target_path) >= os.path.getmtime(source_path):
                continue

            try:
                with Image.open(source_path) as img:
                    # Handle GIF (just resize first frame or skip for now to avoid complexity)
                    if filename.lower().endswith('.gif'):
                        # For now, just copy or simple resize of first frame
                        # Pillow's resize on animated gifs is tricky, we'll do a simple resize
                        img.thumbnail((max_width, max_width), Image.Resampling.LANCZOS)
                        img.save(target_path)
                    else:
                        # Standard image resize
                        img.thumbnail((max_width, max_width), Image.Resampling.LANCZOS)
                        img.save(target_path, optimize=True, quality=85)
                    print(f"Generated thumbnail for {filename}")
            except Exception as e:
                print(f"Error processing {filename}: {e}")

if __name__ == "__main__":
    generate_thumbnails("assets/screenshots", "assets/thumbnails")
