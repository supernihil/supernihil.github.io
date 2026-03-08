import os
from PIL import Image, ImageSequence

def generate_thumbnails(source_dir, target_dir, max_width=300):
    if not os.path.exists(target_dir):
        os.makedirs(target_dir)

    for filename in os.listdir(source_dir):
        if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp')):
            source_path = os.path.join(source_dir, filename)
            base_name, ext = os.path.splitext(filename)
            
            # Determine target extension
            is_gif = ext.lower() == '.gif'
            target_ext = ".gif" if is_gif else ".jpg"
            target_path = os.path.join(target_dir, f"{base_name}{target_ext}")

            # Skip if thumbnail already exists and is newer than source
            if os.path.exists(target_path) and os.path.getmtime(target_path) >= os.path.getmtime(source_path):
                continue

            try:
                with Image.open(source_path) as img:
                    # Calculate new height to maintain aspect ratio
                    aspect_ratio = img.height / img.width
                    new_height = int(max_width * aspect_ratio)
                    
                    if is_gif and getattr(img, "is_animated", False):
                        # Handle animated GIFs
                        frames = []
                        for frame in ImageSequence.Iterator(img):
                            frame = frame.copy().convert("RGBA")
                            frame.thumbnail((max_width, new_height), Image.Resampling.LANCZOS)
                            frames.append(frame)
                        
                        frames[0].save(
                            target_path,
                            save_all=True,
                            append_images=frames[1:],
                            optimize=False,
                            loop=0,
                            format="GIF",
                            disposal=2
                        )
                        print(f"Generated GIF thumbnail for {filename}")
                    else:
                        # Convert to JPEG for everything else (or static GIFs if requested, but usually JPEG is better for static)
                        img.thumbnail((max_width, new_height), Image.Resampling.LANCZOS)
                        if img.mode in ("RGBA", "P"):
                            img = img.convert("RGB")
                        img.save(target_path, "JPEG", quality=90, optimize=True)
                        print(f"Generated JPEG thumbnail for {filename}")
                        
            except Exception as e:
                print(f"Error processing {filename}: {e}")

if __name__ == "__main__":
    generate_thumbnails("assets/screenshots", "assets/thumbnails")
