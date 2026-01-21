import sys
import os
import tkinter as tk
from tkinter import simpledialog
from PIL import Image, ImageDraw, ImageFont, ImageTk


class ExplodedView:
    def __init__(self, root, width=700, height=900, image_path=None):
        self.width = width
        self.height = height
        self.image_path = image_path
        self.start_line_pos = 50
        self.big_circle_radius = 20
        self.small_circle_radius = 3
        self.dragging = None

        # Initial annotations
        self.annotations = [
            {"id": 1, "x": 250, "y": 50, "label": "Top Panel - 10mm", "side": "left"},
            {"id": 2, "x": 500, "y": 200, "label": "Side Panel - 18mm", "side": "right"}
        ]

        # ----------------------------------------
        # Create PERFECT anti-aliased circle image
        # ----------------------------------------
        circle_size = self.big_circle_radius * 2
        self.circle_img = self.make_perfect_circle(circle_size)
        self.tk_circle_img = ImageTk.PhotoImage(self.circle_img)

        self.root = root
        self.canvas = tk.Canvas(root, width=self.width, height=self.height, bg="white")
        self.canvas.pack()
        self.canvas.bind("<Button-1>", self.add_annotation)
        self.canvas.bind("<B1-Motion>", self.drag)
        self.canvas.bind("<ButtonRelease-1>", self.stop_drag)

        self.draw()
        self.create_buttons()

    # ----------------------------------------------------
    # HIGH-RES ANTI-ALIASED CIRCLE (FIX FOR PIXELATION)
    # ----------------------------------------------------
    def make_perfect_circle(self, final_size, upscale=8):
        big = final_size * upscale

        img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        # Draw huge circle
        draw.ellipse((0, 0, big - 1, big - 1), fill="black")

        # Downscale → PERFECT anti-aliasing
        img = img.resize((final_size, final_size), Image.LANCZOS)
        return img

    # ----------------------------------------------------
    # DRAW CANVAS
    # ----------------------------------------------------
    def draw(self):
        self.canvas.delete("all")

        # Draw background image if exists
        if self.image_path:
            try:
                self.img = tk.PhotoImage(file=self.image_path)
                self.canvas.create_image(0, 0, anchor=tk.NW, image=self.img)
            except Exception as e:
                print(f"Error loading image: {e}")

        for ann in self.annotations:
            line_start = self.start_line_pos if ann["side"] == "left" else self.width - self.start_line_pos

            # Line
            line_id = self.canvas.create_line(
                line_start, ann["y"], ann["x"], ann["y"],
                width=1, fill="black"
            )

            # Small circle
            small_circle_id = self.canvas.create_oval(
                ann["x"] - self.small_circle_radius,
                ann["y"] - self.small_circle_radius,
                ann["x"] + self.small_circle_radius,
                ann["y"] + self.small_circle_radius,
                fill="black", outline="black"
            )
            self.canvas.tag_bind(small_circle_id, "<Button-1>", lambda e, a=ann: self.start_drag(a, e))

            # PERFECT anti-aliased big circle
            big_circle_id = self.canvas.create_image(
                line_start - self.big_circle_radius,
                ann["y"] - self.big_circle_radius,
                anchor=tk.NW,
                image=self.tk_circle_img
            )

            # Text number
            text_id = self.canvas.create_text(
                line_start, ann["y"],
                text=str(ann["id"]),
                fill="white",
                font=("Arial", 16, "bold")
            )

            ann["shape_ids"] = [line_id, small_circle_id, big_circle_id, text_id]

            self.canvas.tag_bind(big_circle_id, "<ButtonRelease-1>", lambda e, a=ann: self._delete_and_break(e, a))
            self.canvas.tag_bind(text_id, "<ButtonRelease-1>", lambda e, a=ann: self._delete_and_break(e, a))

    # ----------------------------------------------------
    # DRAGGING
    # ----------------------------------------------------
    def start_drag(self, ann, event):
        self.dragging = ann

    def drag(self, event):
        if self.dragging:
            self.dragging["x"] = event.x
            self.dragging["y"] = event.y
            self.draw()

    def stop_drag(self, event):
        self.dragging = None

    # ----------------------------------------------------
    # ADD ANNOTATION
    # ----------------------------------------------------
    def add_annotation(self, event):
        # Prevent click on top of existing
        for ann in self.annotations:
            line_start = self.start_line_pos if ann["side"] == "left" else self.width - self.start_line_pos
            if abs(event.x - line_start) < self.big_circle_radius and abs(event.y - ann["y"]) < self.big_circle_radius:
                return
            if abs(event.x - ann["x"]) < 10 and abs(event.y - ann["y"]) < 10:
                return

        side = "left" if event.x < self.width / 2 else "right"
        new_id = simpledialog.askinteger("Annotation Number", "Enter number:")
        if new_id is None:
            return

        self.annotations.append(
            {"id": new_id, "x": event.x, "y": event.y, "label": f"New Label {new_id}", "side": side}
        )
        self.draw()

    # ----------------------------------------------------
    # DELETE
    # ----------------------------------------------------
    def _delete_and_break(self, event, ann):
        if ann in self.annotations:
            self.delete_annotation(ann)
        return "break"

    def delete_annotation(self, ann):
        for sid in ann.get("shape_ids", []):
            self.canvas.delete(sid)
        self.annotations.remove(ann)
        self.draw()

    # ----------------------------------------------------
    # SAVE PNG
    # ----------------------------------------------------
    def create_buttons(self):
        btn = tk.Button(self.root, text="Save as PNG", command=self.save_as_png)
        btn.pack(side=tk.LEFT, padx=10, pady=5)

    def save_as_png(self):
        update_folder = "static/uploads"
        os.makedirs(update_folder, exist_ok=True)

        # HIGH RESOLUTION: 4x the canvas size
        scale = 4
        high_width = self.width * scale
        high_height = self.height * scale

        img = Image.new("RGB", (high_width, high_height), "white")
        draw = ImageDraw.Draw(img)

        # Background
        if self.image_path:
            try:
                bg = Image.open(self.image_path).resize((high_width, high_height), Image.LANCZOS)
                img.paste(bg, (0, 0))
            except:
                pass

        # Create high-res circle for export
        big_circle_highres = self.make_perfect_circle(self.big_circle_radius * 2 * scale)

        for ann in self.annotations:
            line_start = (self.start_line_pos if ann["side"] == "left" else self.width - self.start_line_pos) * scale
            ann_x = ann["x"] * scale
            ann_y = ann["y"] * scale

            # Line
            draw.line([(line_start, ann_y), (ann_x, ann_y)], fill="black", width=scale)

            # Small circle
            small_r = self.small_circle_radius * scale
            draw.ellipse([
                ann_x - small_r,
                ann_y - small_r,
                ann_x + small_r,
                ann_y + small_r
            ], fill="black")

            # PERFECT big circle - paste the high-res anti-aliased image
            big_r = self.big_circle_radius * scale
            img.paste(
                big_circle_highres,
                (int(line_start - big_r), int(ann_y - big_r)),
                big_circle_highres
            )

            # Text
            try:
                font = ImageFont.truetype("arial.ttf", 20 * scale)
            except:
                font = ImageFont.load_default()

            draw.text((line_start, ann_y), str(ann["id"]), fill="white", anchor="mm", font=font)

        output_path = os.path.join(update_folder, os.path.basename(self.image_path))
        img.save(output_path, dpi=(300, 300))
        print("Saved HIGH-RES:", output_path)
        self.root.quit()


# ----------------------------------------------------
# MAIN
# ----------------------------------------------------
if __name__ == "__main__":
    if len(sys.argv) > 1:
        image_path = sys.argv[1]
        root = tk.Tk()
        root.title("Exploded View")
        app = ExplodedView(root, 700, 900, image_path)
        root.mainloop()