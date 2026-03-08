import os
import subprocess
from PIL import Image

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
                if is_gif:
                    # Use gifsicle for animated gifs to prevent artifacting and palette degradation
                    # It natively handles animated and static gifs optimally.
                    try:
                        subprocess.run(
                            ["gifsicle", "--resize-width", str(max_width), "--optimize=3", source_path, "-o", target_path],
                            check=True,
                            capture_output=True
                        )
                        print(f"Generated pristine GIF thumbnail for {filename} via gifsicle")
                    except FileNotFoundError:
                        print("gifsicle not found! Falling back to simple file copy for GIF to preserve quality.")
                        import shutil
                        shutil.copy2(source_path, target_path)
                    except subprocess.CalledProcessError as e:
                        print(f"gifsicle failed on {filename}: {e.stderr}. Falling back to copy.")
                        import shutil
                        shutil.copy2(source_path, target_path)
                else:
                    # Convert to JPEG with high quality
                    with Image.open(source_path) as img:
                        # Calculate new height to maintain aspect ratio
                        aspect_ratio = img.height / img.width
                        new_height = int(max_width * aspect_ratio)
                        
                        img.thumbnail((max_width, new_height), Image.Resampling.LANCZOS)
                        if img.mode in ("RGBA", "P", "LA"):
                            # Create a white background for transparent images
                            bg = Image.new("RGB", img.size, (255, 255, 255))
                            if img.mode in ("RGBA", "LA"):
                                bg.paste(img, mask=img.split()[-1])
                            else:
                                bg.paste(img)
                            img = bg
                        
                        img.save(target_path, "JPEG", quality=95, optimize=True)
                        print(f"Generated high-quality JPEG thumbnail for {filename}")
                        
            except Exception as e:
                print(f"Error processing {filename}: {e}")

if __name__ == "__main__":
    generate_thumbnails("assets/screenshots", "assets/thumbnails")
