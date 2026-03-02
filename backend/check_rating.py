import requests
import getpass

def main():
    username = input("Enter your BSUIR IIS username (student ID etc): ")
    password = getpass.getpass("Enter your password: ")

    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json'
    })

    login_url = 'https://iis.bsuir.by/api/v1/auth/login'
    login_data = {
        'username': username,
        'password': password,
        'rememberDevice': True
    }

    print("Logging in...")
    resp = session.post(login_url, json=login_data)
    
    if resp.status_code != 200:
        print(f"Login failed: {resp.status_code}")
        print(resp.text)
        return

    print("Login successful.")
    
    # Try fetching the personal rating
    print("Fetching personal rating...")
    rating_url = 'https://iis.bsuir.by/api/v1/profiles/personal-cv-rating'
    resp = session.get(rating_url)
    print(f"Status: {resp.status_code}")
    print(resp.text[:500])

if __name__ == '__main__':
    main()
