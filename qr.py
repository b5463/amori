import qrcode
from PIL import Image, ImageTk
import tkinter as tk
from tkinter import messagebox

# ================================
# Author: Alexander J. Moravcik
# Date: 07/08/2024
# Description: This script generates a QR code for a given URL and saves it to a specified file.
#              It also adds a logo to the center of the QR code.
# ================================

def generate_qr_code(url, output_file, logo_path=None):
    """
    Generate a QR code for the given URL and save it to the specified output file.
    A logo is added to the center of the QR code if provided.

    Parameters:
    - url (str): The URL to encode in the QR code.
    - output_file (str): The file path to save the generated QR code image.
    - logo_path (str): The file path to the logo image (optional).
    """
    # Create a QR Code instance
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,  # High error correction to accommodate the logo
        box_size=10,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)

    # Create the QR Code image
    img = qr.make_image(fill_color="black", back_color="white").convert("RGBA")

    if logo_path:
        # Open the logo image
        logo = Image.open(logo_path)

        # Calculate the size of the logo and resize it
        qr_width, qr_height = img.size
        logo_size = qr_width // 4
        logo = logo.resize((logo_size, logo_size), Image.ANTIALIAS)

        # Calculate the position to place the logo
        pos = ((qr_width - logo_size) // 2, (qr_height - logo_size) // 2)

        # Paste the logo onto the QR Code image
        img.paste(logo, pos, mask=logo)

    # Save the generated QR Code image
    img.save(output_file)
    print(f"QR code generated and saved as {output_file}")

def update_qr_code(*args):
    url = url_entry.get()
    if url:
        generate_qr_code(url, "qrcode.png", "logo.png")
        qr_image = Image.open("qrcode.png")
        qr_image.thumbnail((200, 200), Image.ANTIALIAS)
        global qr_preview
        qr_preview = ImageTk.PhotoImage(qr_image)
        qr_label.config(image=qr_preview)
    else:
        qr_label.config(image='')

def on_enter(event):
    root.destroy()

# Set up the GUI
root = tk.Tk()
root.title("QR Code Generator")
root.configure(bg="#f0f0f0")

tk.Label(root, text="Enter URL:", bg="#f0f0f0", font=("Arial", 12)).grid(row=0, column=0, padx=10, pady=10, sticky='e')
url_entry = tk.Entry(root, width=50, font=("Arial", 12))
url_entry.grid(row=0, column=1, padx=10, pady=10)
url_entry.bind("<KeyRelease>", update_qr_code)
url_entry.bind("<Return>", on_enter)

qr_label = tk.Label(root, bg="#f0f0f0")
qr_label.grid(row=1, column=0, columnspan=2, pady=10)

root.mainloop()