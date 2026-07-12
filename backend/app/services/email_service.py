import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailNotConfiguredError(RuntimeError):
    pass


def smtp_is_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_FROM)


def send_email_with_csv_attachment(
    *,
    to_email: str,
    subject: str,
    body: str,
    filename: str,
    csv_content: str,
) -> None:
    if not smtp_is_configured():
        raise EmailNotConfiguredError("Email delivery is not configured on this server.")

    message = EmailMessage()
    message["From"] = settings.SMTP_FROM
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)
    message.add_attachment(
        csv_content.encode("utf-8"),
        maintype="text",
        subtype="csv",
        filename=filename,
    )

    if settings.SMTP_USE_SSL:
        with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT) as client:
            if settings.SMTP_USER:
                client.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            client.send_message(message)
        return

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as client:
        if settings.SMTP_USE_TLS:
            client.starttls()
        if settings.SMTP_USER:
            client.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
        client.send_message(message)

    logger.info("Sent email with CSV attachment to %s", to_email)
