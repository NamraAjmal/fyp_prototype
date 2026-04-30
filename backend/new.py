# create_test_user.py
import requests
import json

# If your bootstrap endpoint requires admin, create a direct insert
# Or use the test endpoint if you added it

# Option 1: Use bootstrap-owner (if no users exist)
response = requests.post('http://localhost:5000/auth/bootstrap-owner', 
    json={
        "organization_name": "Test Organization",
        "organization_code": "test-org",
        "email": "test@example.com",
        "username": "testuser",
        "display_name": "Test User",
        "password": "test123"
    })
print(response.json())

# Option 2: Login with the new user
response = requests.post('http://localhost:5000/auth/login',
    json={
        "identifier": "test@example.com",
        "password": "test123"
    })
print(response.json())