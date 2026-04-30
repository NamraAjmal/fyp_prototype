from flask import Flask
import smtplib
from email.mime.text import MIMEText

app = Flask(__name__)

@app.route("/test-email")
def test_email():
    sender = "namraajmal12@gmail.com"
    password = "iiyz tqqz wcsy noxj"

    receiver = "namra."  # send to yourself

    msg = MIMEText("This is a test email from your Smart City system.")
    msg["Subject"] = "Test Email"
    msg["From"] = sender
    msg["To"] = receiver

    try:
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(sender, password)
        server.sendmail(sender, [receiver], msg.as_string())
        server.quit()
        return "Email sent successfully ✅"
    except Exception as e:
        return f"Error: {str(e)}"