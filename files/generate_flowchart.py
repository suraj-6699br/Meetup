import os
from PIL import Image, ImageDraw, ImageFont

def create_flowchart(theme="light", output_path="flowchart.png"):
    # Dimensions (High resolution for PPT)
    width = 1600
    height = 1400
    
    if theme == "dark":
        bg_color = (24, 24, 27)          # Dark background #18181b
        text_color = (244, 244, 245)      # Near white
        line_color = (113, 113, 122)      # Zinc 500
        box_bg = (39, 39, 42)            # Zinc 800
        box_border = (82, 82, 91)        # Zinc 600
        diamond_bg = (39, 39, 42)
        diamond_border = (217, 119, 6)   # Amber border
        highlight_bg = (59, 7, 100)      # Purple dark
        highlight_border = (168, 85, 247)# Purple border
        highlight_text = (245, 208, 254)
        tag_bg = (30, 41, 59)
    else:
        bg_color = (255, 255, 255)       # Pure white for PPT
        text_color = (15, 23, 42)        # Slate 900
        line_color = (71, 85, 105)       # Slate 600
        box_bg = (248, 250, 252)         # Slate 50
        box_border = (148, 163, 184)     # Slate 400
        diamond_bg = (254, 243, 199)     # Amber 100
        diamond_border = (217, 119, 6)   # Amber 600
        highlight_bg = (250, 232, 255)   # Purple 100
        highlight_border = (168, 85, 247)# Purple 500
        highlight_text = (88, 28, 135)   # Purple 900
        tag_bg = (241, 245, 249)

    img = Image.new("RGBA", (width, height), bg_color)
    draw = ImageDraw.Draw(img)

    # Fonts
    try:
        font_main = ImageFont.truetype("segoeui.ttf", 22)
        font_bold = ImageFont.truetype("segoeuib.ttf", 22)
        font_sub = ImageFont.truetype("segoeui.ttf", 17)
        font_tag = ImageFont.truetype("segoeuib.ttf", 15)
        font_title = ImageFont.truetype("segoeuib.ttf", 28)
    except:
        font_main = font_bold = font_sub = font_tag = font_title = ImageFont.load_default()

    def draw_rounded_box(xy, fill, outline, width_stroke=2, radius=14):
        draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=int(width_stroke))

    def draw_diamond(center, size_x, size_y, fill, outline, width_stroke=2):
        cx, cy = center
        points = [
            (cx, cy - size_y),
            (cx + size_x, cy),
            (cx, cy + size_y),
            (cx - size_x, cy)
        ]
        draw.polygon(points, fill=fill, outline=outline)
        # re-draw outline for crisp thickness
        for i in range(len(points)):
            draw.line([points[i], points[(i+1)%len(points)]], fill=outline, width=int(width_stroke))

    def draw_arrow(start, end, text_label=""):
        x1, y1 = start
        x2, y2 = end
        draw.line([start, end], fill=line_color, width=3)
        # Arrowhead at end
        dx = x2 - x1
        dy = y2 - y1
        if dx == 0 and dy > 0:  # pointing down
            draw.polygon([(x2 - 7, y2 - 12), (x2 + 7, y2 - 12), (x2, y2)], fill=line_color)
        elif dx == 0 and dy < 0: # pointing up
            draw.polygon([(x2 - 7, y2 + 12), (x2 + 7, y2 + 12), (x2, y2)], fill=line_color)
        elif dy == 0 and dx > 0: # pointing right
            draw.polygon([(x2 - 12, y2 - 7), (x2 - 12, y2 + 7), (x2, y2)], fill=line_color)
        elif dy == 0 and dx < 0: # pointing left
            draw.polygon([(x2 + 12, y2 - 7), (x2 + 12, y2 + 7), (x2, y2)], fill=line_color)
            
        if text_label:
            # Draw tiny label pill
            lx = (x1 + x2) / 2
            ly = (y1 + y2) / 2
            bbox = draw.textbbox((0, 0), text_label, font=font_tag)
            tw = bbox[2] - bbox[0] + 16
            th = bbox[3] - bbox[1] + 8
            draw_rounded_box([lx - tw/2, ly - th/2, lx + tw/2, ly + th/2], fill=tag_bg, outline=line_color, width_stroke=1, radius=6)
            draw.text((lx - tw/2 + 8, ly - th/2 + 3), text_label, fill=text_color, font=font_tag)

    # Title
    title_text = "Meetup — Application & AI Summarization Flow"
    draw.text((width/2 - 320, 35), title_text, fill=text_color, font=font_title)

    # 1. Top Node: User visits App
    c_top_x = 800
    top_y = 110
    draw_rounded_box([c_top_x - 110, top_y, c_top_x + 110, top_y + 48], fill=box_bg, outline=box_border, width_stroke=2, radius=24)
    draw.text((c_top_x - 72, top_y + 11), "User visits App", fill=text_color, font=font_main)

    # Arrow: User visits App -> Authenticated?
    draw_arrow((c_top_x, top_y + 48), (c_top_x, 200))

    # 2. Decision: Authenticated?
    draw_diamond((c_top_x, 260), 105, 58, fill=diamond_bg, outline=diamond_border, width_stroke=2)
    draw.text((c_top_x - 65, 248), "Authenticated?", fill=text_color, font=font_bold)

    # Branch No -> Left to Login / Register Page
    login_cx = 360
    login_cy = 440
    # Line from diamond left (695, 260) -> (360, 260) -> (360, 400)
    draw.line([(695, 260), (login_cx, 260)], fill=line_color, width=3)
    draw_arrow((login_cx, 260), (login_cx, 400), text_label="No")

    # Login / Register Page Box
    draw_rounded_box([login_cx - 130, 400, login_cx + 130, 475], fill=box_bg, outline=box_border, width_stroke=2)
    draw.text((login_cx - 95, 412), "Login / Register Page", fill=text_color, font=font_bold)
    draw.text((login_cx - 48, 442), "Clerk Auth", fill=text_color, font=font_sub)

    # Arrow: Login -> Session Token
    draw_arrow((login_cx, 475), (login_cx, 545))

    # Clerk issues Session Token
    draw_rounded_box([login_cx - 130, 545, login_cx + 130, 605], fill=box_bg, outline=box_border, width_stroke=2)
    draw.text((login_cx - 105, 563), "Clerk issues Session Token", fill=text_color, font=font_main)

    # Loop back from Session Token to Authenticated?
    # From right of session token (490, 575) -> (580, 575) -> (580, 260) -> (695, 260)
    draw.line([(login_cx + 130, 575), (580, 575)], fill=line_color, width=3)
    draw.line([(580, 575), (580, 280)], fill=line_color, width=3)
    draw_arrow((580, 280), (695, 260))

    # Branch Yes -> Down to Dashboard
    draw_arrow((c_top_x, 318), (c_top_x, 400), text_label="Yes")

    # 3. Dashboard Box
    dash_y = 400
    draw_rounded_box([c_top_x - 110, dash_y, c_top_x + 110, dash_y + 55], fill=box_bg, outline=box_border, width_stroke=2)
    draw.text((c_top_x - 52, dash_y + 14), "Dashboard", fill=text_color, font=font_bold)

    # Arrow: Dashboard -> User Action
    draw_arrow((c_top_x, dash_y + 55), (c_top_x, 520))

    # 4. Decision: User Action
    draw_diamond((c_top_x, 570), 100, 50, fill=diamond_bg, outline=diamond_border, width_stroke=2)
    draw.text((c_top_x - 52, 558), "User Action", fill=text_color, font=font_bold)

    # 4 Action Branches from (800, 620)
    # Target X positions for 4 columns:
    col1_x = 210   # Create Meeting
    col2_x = 590   # Join Meeting
    col3_x = 1010  # View Sessions (Highlighted)
    col4_x = 1400  # Pricing / Upgrade

    split_y = 665
    draw.line([(c_top_x, 620), (c_top_x, split_y)], fill=line_color, width=3)
    draw.line([(col1_x, split_y), (col4_x, split_y)], fill=line_color, width=3)

    # Column 1: Create Meeting
    draw_arrow((col1_x, split_y), (col1_x, 725))
    draw_rounded_box([col1_x - 105, 725, col1_x + 105, 785], fill=box_bg, outline=box_border, width_stroke=2)
    draw.text((col1_x - 72, 743), "Create Meeting", fill=text_color, font=font_main)

    # Column 2: Join Meeting
    draw_arrow((col2_x, split_y), (col2_x, 725))
    draw_rounded_box([col2_x - 115, 725, col2_x + 115, 785], fill=box_bg, outline=box_border, width_stroke=2)
    draw.text((col2_x - 90, 743), "Join Meeting via Link", fill=text_color, font=font_main)

    # Meeting Room (shared destination of col1 and col2)
    room_cx = 400
    room_y = 875
    draw.line([(col1_x, 785), (col1_x, 835)], fill=line_color, width=3)
    draw.line([(col2_x, 785), (col2_x, 835)], fill=line_color, width=3)
    draw.line([(col1_x, 835), (col2_x, 835)], fill=line_color, width=3)
    draw_arrow((room_cx, 835), (room_cx, room_y))

    draw_rounded_box([room_cx - 120, room_y, room_cx + 120, room_y + 65], fill=box_bg, outline=(22, 163, 74), width_stroke=2.5)
    draw.text((room_cx - 70, room_y + 12), "Meeting Room", fill=(22, 163, 74) if theme=="light" else (74, 222, 128), font=font_bold)
    draw.text((room_cx - 96, room_y + 38), "P2P WebRTC Video & Audio", fill=text_color, font=font_sub)

    # Column 3: View Sessions (WITH AI SUMMARIZE)
    draw_arrow((col3_x, split_y), (col3_x, 725))
    draw_rounded_box([col3_x - 95, 725, col3_x + 95, 785], fill=box_bg, outline=box_border, width_stroke=2)
    draw.text((col3_x - 62, 743), "View Sessions", fill=text_color, font=font_main)

    # Arrow down to Sessions Page
    draw_arrow((col3_x, 785), (col3_x, 855))

    # Sessions Page Box (MODIFIED AS REQUESTED: contains Chat, Participant History & AI Summarize)
    sess_y = 855
    draw_rounded_box([col3_x - 170, sess_y, col3_x + 170, sess_y + 90], fill=highlight_bg, outline=highlight_border, width_stroke=2.5)
    draw.text((col3_x - 64, sess_y + 12), "Sessions Page", fill=highlight_text, font=font_bold)
    draw.text((col3_x - 145, sess_y + 40), "• Chat Transcript   • Participant History", fill=text_color, font=font_sub)
    draw.text((col3_x - 90, sess_y + 63), "• AI Meeting Summarize ✨", fill=highlight_text, font=font_bold)

    # Arrow from Sessions Page to AI Meeting Summary
    draw_arrow((col3_x, sess_y + 90), (col3_x, 1015))

    # AI Meeting Summary Result Box
    summ_y = 1015
    draw_rounded_box([col3_x - 170, summ_y, col3_x + 170, summ_y + 85], fill=highlight_bg, outline=highlight_border, width_stroke=2.5)
    draw.text((col3_x - 95, summ_y + 12), "AI Meeting Summary", fill=highlight_text, font=font_bold)
    draw.text((col3_x - 150, summ_y + 38), "Whisper Speech-to-Text Transcription", fill=text_color, font=font_sub)
    draw.text((col3_x - 138, summ_y + 59), "& GPT Key Takeaways / Action Items", fill=text_color, font=font_sub)

    # Column 4: Pricing / Upgrade
    draw_arrow((col4_x, split_y), (col4_x, 725))
    draw_rounded_box([col4_x - 95, 725, col4_x + 95, 785], fill=box_bg, outline=box_border, width_stroke=2)
    draw.text((col4_x - 70, 743), "Pricing / Upgrade", fill=text_color, font=font_main)

    draw_arrow((col4_x, 785), (col4_x, 875))
    draw_rounded_box([col4_x - 120, 875, col4_x + 120, 935], fill=box_bg, outline=box_border, width_stroke=2)
    draw.text((col4_x - 100, 893), "Upgrade to Premium Plan", fill=text_color, font=font_main)

    # Save
    img.save(output_path, "PNG")
    # Also save as JPEG
    jpg_path = os.path.splitext(output_path)[0] + ".jpg"
    img.convert("RGB").save(jpg_path, "JPEG", quality=95)
    print(f"Generated: {output_path} and {jpg_path}")

create_flowchart("light", r"d:\mini project 5th sem\Meetup - Full Stack Video Calling App (1)\meetup\meetup_flowchart_with_summary.png")
create_flowchart("dark", r"d:\mini project 5th sem\Meetup - Full Stack Video Calling App (1)\meetup\meetup_flowchart_dark_with_summary.png")
