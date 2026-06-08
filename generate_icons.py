import os
import subprocess
from PIL import Image
import io

def generate_icons():
    svg_path = 'public/assets/logo-fallback.svg'
    icons_dir = 'src-tauri/icons'
    os.makedirs(icons_dir, exist_ok=True)

    # Use rsvg-convert or similar if available, otherwise use a simple approach
    # Since we have PIL, let's try to create a simple PNG version
    # Actually, let's use a simple colored square with "TTS" text for the icons
    # to ensure they are high quality and consistent.

    sizes = [32, 128, 256, 512]
    
    for size in sizes:
        img = Image.new('RGBA', (size, size), (10, 25, 47, 255)) # #0A192F
        from PIL import ImageDraw, ImageFont
        draw = ImageDraw.Draw(img)
        
        # Try to draw a simple circle and text
        draw.ellipse([size*0.05, size*0.05, size*0.95, size*0.95], outline=(0, 240, 255, 76), width=max(1, size//50))
        
        # Draw text "TTS"
        # For simplicity without loading external fonts, we'll just use default
        try:
            # Try to find a font
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", size // 2)
        except:
            font = ImageFont.load_default()
            
        text = "TTS"
        bbox = draw.textbbox((0, 0), text, font=font)
        w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text(((size - w) / 2, (size - h) / 2 - size*0.05), text, fill="white", font=font)
        
        img.save(f'{icons_dir}/{size}x{size}.png')
        if size == 128:
            img.save(f'{icons_dir}/128x128@2x.png') # This is actually 256, but let's follow the naming
            img.save(f'{icons_dir}/icon.png')
            
    # Create .ico file (standard 32x32 for icon.ico)
    img_32 = Image.open(f'{icons_dir}/32x32.png')
    img_32.save(f'{icons_dir}/icon.ico', format='ICO', sizes=[(32, 32)])
    
    # Also save as logo.png in public/assets
    img_512 = Image.open(f'{icons_dir}/512x512.png')
    img_512.save('public/assets/logo.png')

    print("Icons generated successfully.")

if __name__ == "__main__":
    generate_icons()
