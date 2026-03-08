import os
from PIL import Image, ImageSequence

def generate_thumbnails(source_dir, target_dir, max_width=300):
    if not os.path.exists(target_dir):
        os.makedirs(target_dir)

    for filename in os.listdir(source_dir):
        if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp')):
            source_path = os.path.join(source_dir, filename)
            # Find the last dot to correctly replace the extension
            base_name, _ = os.path.splitext(filename)
            target_path = os.path.join(target_dir, f"{base_name}.gif")

            try:
                with Image.open(source_path) as img:
                    # Calculate new height to maintain aspect ratio
                    aspect_ratio = img.height / img.width
                    new_height = int(max_width * aspect_ratio)
                    
                    if getattr(img, "is_animated", False):
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
                            optimize=False, # Higher quality
                            loop=0,
                            format="GIF",
                            disposal=2 # Help with transparency
                        )
                    else:
                        # Convert static images to GIF
                        img.thumbnail((max_width, new_height), Image.Resampling.LANCZOS)
                        # Use high quality palette generation
                        img = img.convert("RGB").convert("P", palette=Image.ADAPTIVE, colors=256)
                        img.save(target_path, format="GIF")
                    
                    print(f"Generated high-quality GIF thumbnail for {filename}")
            except Exception as e:
                print(f"Error processing {filename}: {e}")

if __name__ == "__main__":
    generate_thumbnails("assets/screenshots", "assets/thumbnails")
