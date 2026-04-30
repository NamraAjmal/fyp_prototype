from getpass import getpass
from werkzeug.security import generate_password_hash


def main():
    password = getpass("Enter password to hash: ")
    confirm = getpass("Confirm password: ")
    if password != confirm:
        print("Passwords do not match")
        raise SystemExit(1)

    if not password:
        print("Password cannot be empty")
        raise SystemExit(1)

    print("\nGenerated hash:\n")
    print(generate_password_hash(password))


if __name__ == "__main__":
    main()
