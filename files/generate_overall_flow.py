import os
from PIL import Image, ImageDraw, ImageFont

def create_overall_flow_image(theme="light", output_path="overall_application_flow.png"):
    # 16:9 Widescreen Full HD Dimensions for PowerPoint
    width = 1920
    height = 1080
    
    if theme == "dark":
        bg_color = (15, 23, 42)          # Slate 900
        card_bg = (30, 41, 59)           # Slate 800
        card_border = (71, 85, 105)      # Slate 600
        text_primary = (248, 250, 252)   # Slate 50
        text_secondary = (148, 163, 184) # Slate 400
        line_color = (148, 163, 184)     # Slate 400
        diamond_bg = (41, 37, 36)        # Dark warm
        diamond_border = (245, 158, 11)  # Amber 500
        diamond_text = (254, 243, 199)
        green_bg = (6, 78, 59)           # Emerald dark
        green_border = (16, 185, 129)    # Emerald 500
        green_text = (209, 250, 229)
        purple_bg = (59, 7, 100)         # Purple dark
        purple_border = (192, 132, 252)  # Purple 400
        purple_text = (245, 208, 254)
        tag_bg = (51, 65, 85)
    else:
        bg_color = (255, 255, 255)       # Pure crisp white
        card_bg = (248, 250, 252)        # Slate 50
        card_border = (203, 213, 225)    # Slate 300
        text_primary = (15, 23, 42)      # Slate 900
        text_secondary = (71, 85, 105)   # Slate 600
        line_color = (71, 85, 105)       # Slate 600
        diamond_bg = (254, 243, 199)     # Amber 100
        diamond_border = (217, 119, 6)   # Amber 600
        diamond_text = (146, 64, 14)     # Amber 800
        green_bg = (236, 253, 245)       # Emerald 50
        green_border = (16, 185, 129)    # Emerald 500
        green_text = (6, 95, 70)         # Emerald 800
        purple_bg = (250, 232, 255)      # Purple 100
        purple_border = (168, 85, 247)   # Purple 500
        purple_text = (88, 28, 135)      # Purple 900
        tag_bg = (241, 245, 249)

    img = Image.new("RGBA", (width, height), bg_color)
    draw = ImageDraw.Draw(img)

    # Fonts
    try:
        font_title = ImageFont.truetype("segoeuib.ttf", 32)
        font_subtitle = ImageFont.truetype("segoeui.ttf", 18)
        font_bold = ImageFont.truetype("segoeuib.ttf", 20)
        font_main = ImageFont.truetype("segoeui.ttf", 19)
        font_sub = ImageFont.truetype("segoeui.ttf", 15)
        font_tag = ImageFont.truetype("segoeuib.ttf", 14)
    except:
        font_title = font_subtitle = font_bold = font_main = font_sub = font_tag = ImageFont.load_default()

    def draw_box(xy, fill, outline, stroke=2, radius=12):
        draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=int(stroke))

    def draw_diamond(center, sx, sy, fill, outline, stroke=2):
        cx, cy = center
        pts = [(cx, cy - sy), (cx + sx, cy), (cx, cy + sy), (cx - sx, cy)]
        draw.polygon(pts, fill=fill, outline=outline)
        for i in range(len(pts)):
            draw.line([pts[i], pts[(i+1)%len(pts)]], fill=outline, width=int(stroke))

    def draw_arrow(start, end, label=""):
        x1, y1 = start
        x2, y2 = end
        draw.line([start, end], fill=line_color, width=3)
        dx = x2 - x1
        dy = y2 - y1
        if dx == 0 and dy > 0:    # down
            draw.polygon([(x2 - 6, y2 - 12), (x2 + 6, y2 - 12), (x2, y2)], fill=line_color)
        elif dx == 0 and dy < 0:  # up
            draw.polygon([(x2 - 6, y2 + 12), (x2 + 6, y2 + 12), (x2, y2)], fill=line_color)
        elif dy == 0 and dx > 0:  # right
            draw.polygon([(x2 - 12, y2 - 6), (x2 - 12, y2 + 6), (x2, y2)], fill=line_color)
        elif dy == 0 and dx < 0:  # left
            draw.polygon([(x2 + 12, y2 - 6), (x2 + 12, y2 + 6), (x2, y2)], fill=line_color)
            
        if label:
            lx = (x1 + x2) / 2
            ly = (y1 + y2) / 2
            bbox = draw.textbbox((0, 0), label, font=font_tag)
            tw = bbox[2] - bbox[0] + 16
            th = bbox[3] - bbox[1] + 8
            draw_box([lx - tw/2, ly - th/2, lx + tw/2, ly + th/2], fill=tag_bg, outline=line_color, stroke=1, radius=6)
            draw.text((lx - tw/2 + 8, ly - th/2 + 3), label, fill=text_primary, font=font_tag)

    # Header Title
    title = "OVERALL APPLICATION FLOW"
    subtitle = "Meetup — Peer-to-Peer Video Calling with Automated AI Meeting Summarization"
    draw.text((width/2 - 250, 40), title, fill=text_primary, font=font_title)
    draw.text((width/2 - 340, 85), subtitle, fill=text_secondary, font=font_subtitle)
    draw.line([(width/2 - 400, 118), (width/2 + 400, 118)], fill=card_border, width=2)

    # ==========================
    # LEFT SECTION: AUTH FLOW
    # ==========================
    auth_x = 240
    
    # 1. User visits App
    draw_box([auth_x - 110, 160, auth_x + 110, 215], fill=card_bg, outline=card_border, radius=28)
    draw.text((auth_x - 70, 175), "User visits App", fill=text_primary, font=font_bold)

    # Arrow -> Authenticated?
    draw_arrow((auth_x, 215), (auth_x, 280))

    # 2. Decision: Authenticated?
    draw_diamond((auth_x, 340), 105, 55, fill=diamond_bg, outline=diamond_border)
    draw.text((auth_x - 62, 328), "Authenticated?", fill=diamond_text, font=font_bold)

    # Branch No -> Login Page
    draw_arrow((auth_x, 395), (auth_x, 480), label="No")

    # 3. Login / Register Page
    draw_box([auth_x - 130, 480, auth_x + 130, 555], fill=card_bg, outline=card_border)
    draw.text((auth_x - 95, 493), "Login / Register Page", fill=text_primary, font=font_bold)
    draw.text((auth_x - 52, 523), "(Clerk Auth)", fill=text_secondary, font=font_sub)

    # Arrow -> Clerk issues Token
    draw_arrow((auth_x, 555), (auth_x, 625))

    # 4. Clerk issues Session Token
    draw_box([auth_x - 130, 625, auth_x + 130, 685], fill=card_bg, outline=card_border)
    draw.text((auth_x - 110, 642), "Clerk issues Session Token", fill=text_primary, font=font_main)

    # Loop back line from Token back to Authenticated?
    # (auth_x - 130, 655) -> left to 70 -> up to 340 -> right to (auth_x - 105, 340)
    draw.line([(auth_x - 130, 655), (70, 655)], fill=line_color, width=3)
    draw.line([(70, 655), (70, 340)], fill=line_color, width=3)
    draw_arrow((70, 340), (auth_x - 105, 340))

    # ==========================
    # CENTER SECTION: DASHBOARD
    # ==========================
    dash_x = 580
    dash_y = 340

    # Branch Yes -> Dashboard
    draw_arrow((auth_x + 105, 340), (dash_x - 110, 340), label="Yes")

    # Dashboard Box
    draw_box([dash_x - 110, dash_y - 35, dash_x + 110, dash_y + 35], fill=card_bg, outline=card_border)
    draw.text((dash_x - 55, dash_y - 12), "Dashboard", fill=text_primary, font=font_bold)

    # Arrow: Dashboard -> User Action
    draw_arrow((dash_x + 110, dash_y), (760, dash_y))

    # User Action Diamond
    act_x = 850
    act_y = 340
    draw_diamond((act_x, act_y), 90, 50, fill=diamond_bg, outline=diamond_border)
    draw.text((act_x - 48, act_y - 12), "User Action", fill=diamond_text, font=font_bold)

    # ==================================
    # RIGHT SECTION: 4 ACTION BRANCHES
    # ==================================
    # The 4 branches will be stacked vertically on the right side for optimal 16:9 layout!
    dest_x = 1060

    # Branch line from User Action to distribution bar
    distrib_x = 980
    draw.line([(act_x + 90, act_y), (distrib_x, act_y)], fill=line_color, width=3)
    
    # 4 Branch Y coordinates:
    y_b1 = 180   # Create Meeting
    y_b2 = 340   # Join Meeting
    y_b3 = 580   # View Sessions + AI Summarize
    y_b4 = 920   # Pricing / Upgrade

    draw.line([(distrib_x, y_b1), (distrib_x, y_b4)], fill=line_color, width=3)

    # --- BRANCH 1: Create Meeting ---
    draw_arrow((distrib_x, y_b1), (dest_x, y_b1))
    draw_box([dest_x, y_b1 - 32, dest_x + 220, y_b1 + 32], fill=card_bg, outline=card_border)
    draw.text((dest_x + 35, y_b1 - 12), "Create Meeting", fill=text_primary, font=font_bold)

    # --- BRANCH 2: Join Meeting via Link ---
    draw_arrow((distrib_x, y_b2), (dest_x, y_b2))
    draw_box([dest_x, y_b2 - 32, dest_x + 220, y_b2 + 32], fill=card_bg, outline=card_border)
    draw.text((dest_x + 15, y_b2 - 12), "Join Meeting via Link", fill=text_primary, font=font_bold)

    # Both Create & Join point to MEETING ROOM
    room_x = 1440
    room_y = 260
    draw.line([(dest_x + 220, y_b1), (1370, y_b1)], fill=line_color, width=3)
    draw.line([(dest_x + 220, y_b2), (1370, y_b2)], fill=line_color, width=3)
    draw.line([(1370, y_b1), (1370, y_b2)], fill=line_color, width=3)
    draw_arrow((1370, room_y), (room_x, room_y))

    # Meeting Room Box (Green themed)
    draw_box([room_x, room_y - 55, room_x + 360, room_y + 55], fill=green_bg, outline=green_border, stroke=2.5)
    draw.text((room_x + 105, room_y - 40), "Meeting Room", fill=green_text, font=font_bold)
    draw.text((room_x + 40, room_y - 12), "• P2P WebRTC Video & Audio Stream", fill=text_primary, font=font_sub)
    draw.text((room_x + 40, room_y + 12), "• In-Meeting Chat & Audio Recording", fill=text_primary, font=font_sub)

    # --- BRANCH 3: View Sessions (HIGHLIGHTED WITH AI SUMMARIZE) ---
    draw_arrow((distrib_x, y_b3), (dest_x, y_b3))
    draw_box([dest_x, y_b3 - 35, dest_x + 220, y_b3 + 35], fill=card_bg, outline=card_border)
    draw.text((dest_x + 38, y_b3 - 12), "View Sessions", fill=text_primary, font=font_bold)

    # Arrow from View Sessions to Sessions Page Box
    draw_arrow((dest_x + 220, y_b3), (1340, y_b3))

    # SESSIONS PAGE BOX (Purple highlight)
    sess_box_x = 1340
    sess_box_w = 480
    sess_box_h = 130
    draw_box([sess_box_x, y_b3 - 65, sess_box_x + sess_box_w, y_b3 + 65], fill=purple_bg, outline=purple_border, stroke=2.5)
    draw.text((sess_box_x + 130, y_b3 - 52), "Sessions Page (History)", fill=purple_text, font=font_bold)
    draw.text((sess_box_x + 35, y_b3 - 20), "• Past Meeting Logs & Attendees List", fill=text_primary, font=font_main)
    draw.text((sess_box_x + 35, y_b3 + 8), "• Real-Time Chat Message Transcripts", fill=text_primary, font=font_main)
    draw.text((sess_box_x + 35, y_b3 + 34), "• AI Meeting Summarize ✨ (Interactive Tab)", fill=purple_text, font=font_bold)

    # Arrow from Sessions Page to AI Meeting Summary Result
    arrow_down_x = sess_box_x + sess_box_w / 2
    draw_arrow((arrow_down_x, y_b3 + 65), (arrow_down_x, y_b3 + 120))

    # AI MEETING SUMMARY DETAILS BOX
    sum_y = y_b3 + 120
    sum_w = 510
    sum_h = 100
    sum_x = arrow_down_x - sum_w / 2
    draw_box([sum_x, sum_y, sum_x + sum_w, sum_y + sum_h], fill=purple_bg, outline=purple_border, stroke=2)
    draw.text((sum_x + 125, sum_y + 12), "AI Meeting Summary View", fill=purple_text, font=font_bold)
    draw.text((sum_x + 40, sum_y + 40), "• OpenAI Whisper: Full Speech-to-Text Transcription", fill=text_primary, font=font_sub)
    draw.text((sum_x + 40, sum_y + 65), "• OpenAI GPT-4o-mini: Key Discussion Points & Action Items", fill=text_primary, font=font_sub)

    # Optional dashed link from Meeting Room down to Summary
    # (showing audio captured in room feeds into the summary)
    draw.line([(room_x + 180, room_y + 55), (room_x + 180, y_b3 - 65)], fill=purple_border, width=2)
    draw_arrow((room_x + 180, y_b3 - 75), (room_x + 180, y_b3 - 65))
    draw.text((room_x + 190, (room_y + y_b3)/2 - 10), "Audio Sync", fill=purple_text, font=font_tag)

    # --- BRANCH 4: Pricing / Upgrade ---
    draw_arrow((distrib_x, y_b4), (dest_x, y_b4))
    draw_box([dest_x, y_b4 - 32, dest_x + 220, y_b4 + 32], fill=card_bg, outline=card_border)
    draw.text((dest_x + 32, y_b4 - 12), "Pricing / Upgrade", fill=text_primary, font=font_bold)

    draw_arrow((dest_x + 220, y_b4), (dest_x + 350, y_b4))
    draw_box([dest_x + 350, y_b4 - 32, dest_x + 650, y_b4 + 32], fill=card_bg, outline=card_border)
    draw.text((dest_x + 380, y_b4 - 12), "Upgrade to Premium Plan", fill=text_primary, font=font_main)

    # Save PNG and JPG
    img.save(output_path, "PNG")
    jpg_path = os.path.splitext(output_path)[0] + ".jpg"
    img.convert("RGB").save(jpg_path, "JPEG", quality=95)
    print(f"Generated: {output_path} and {jpg_path}")

create_overall_flow_image("light", r"d:\mini project 5th sem\Meetup - Full Stack Video Calling App (1)\meetup\overall_application_flow.png")
create_overall_flow_image("dark", r"d:\mini project 5th sem\Meetup - Full Stack Video Calling App (1)\meetup\overall_application_flow_dark.png")
