import os
from pathlib import Path

from locust import HttpUser, between, events, task


LOGIN_EMAIL = os.getenv("LOCUST_LOGIN_EMAIL", "owner@pugc.edu.pk")
LOGIN_PASSWORD = os.getenv("LOCUST_LOGIN_PASSWORD", "123")
LOGIN_ORG_CODE = os.getenv("LOCUST_ORG_CODE", "").strip()


def _resolve_test_image_path():
    """Find an image for multipart upload tests."""
    explicit = os.getenv("LOCUST_TEST_IMAGE", "").strip()
    if explicit and Path(explicit).is_file():
        return Path(explicit)

    base_dir = Path(__file__).resolve().parent
    candidates = [
        base_dir / "test_face.jpg",
        base_dir / "test_worker.jpg",
        base_dir.parent / "test_images" / "test_face.jpg",
        base_dir.parent / "test_images" / "test_worker.jpg",
    ]
    for path in candidates:
        if path.is_file():
            return path

    test_images_dir = base_dir.parent / "test_images"
    if test_images_dir.is_dir():
        for ext in ("*.jpg", "*.jpeg", "*.png"):
            matches = list(test_images_dir.glob(ext))
            if matches:
                return matches[0]

    return None


class DetectionUser(HttpUser):
    wait_time = between(1, 3)

    def on_start(self):
        self.image_path = _resolve_test_image_path()
        self.headers_ready = False
        self._login_and_set_headers()

    def _login_and_set_headers(self):
        payload = {
            "identifier": LOGIN_EMAIL,
            "email": LOGIN_EMAIL,
            "password": LOGIN_PASSWORD,
        }
        if LOGIN_ORG_CODE:
            payload["organization_code"] = LOGIN_ORG_CODE

        response = self.client.post("/auth/login", json=payload, name="Auth Login")
        if response.status_code != 200:
            print(f"Login failed ({response.status_code}): {response.text[:200]}")
            return

        body = response.json()
        user = ((body.get("data") or {}).get("user") or {})
        user_email = user.get("email") or LOGIN_EMAIL
        user_role = user.get("role") or "operator"
        company_id = str(user.get("organization_id") or "").strip()
        company_name = str(user.get("organization_name") or "").strip()

        headers = {
            "X-User-Email": user_email,
            "X-User-Role": user_role,
        }
        if company_id:
            headers["X-Company-ID"] = company_id
        if company_name:
            headers["X-Company-Name"] = company_name

        self.client.headers.update(headers)
        self.headers_ready = True
        print(
            "Authenticated as "
            f"{user_email} (role={user_role}, org_id={company_id or 'n/a'})"
        )

    def _post_image(self, endpoint, name, extra_form=None):
        if not self.headers_ready:
            return
        if not self.image_path or not self.image_path.is_file():
            return

        form_data = extra_form or {}
        with self.image_path.open("rb") as image_file:
            files = {"image": (self.image_path.name, image_file, "image/jpeg")}
            with self.client.post(
                endpoint,
                data=form_data,
                files=files,
                catch_response=True,
                name=name,
            ) as response:
                if response.status_code != 200:
                    response.failure(f"Unexpected status {response.status_code}: {response.text[:200]}")
                    return

                payload = response.json()
                if payload.get("status") != "success":
                    response.failure(f"Unexpected response body: {payload}")

    @task(3)
    def face_detection(self):
        self._post_image(
            "/recognize-face",
            "Face Detection",
            extra_form={"source": "locust", "camera_id": "cam_locust_1"},
        )

    @task(2)
    def helmet_detection(self):
        self._post_image(
            "/helmet-detect",
            "Helmet Detection",
            extra_form={
                "location": "Locust Test Zone",
                "source": "locust",
                "camera_id": "cam_locust_1",
            },
        )

    @task(2)
    def mask_detection(self):
        self._post_image(
            "/mask-detect",
            "Mask Detection",
            extra_form={
                "location": "Locust Test Zone",
                "source": "locust",
                "camera_id": "cam_locust_1",
            },
        )

    @task(1)
    def view_reports(self):
        if not self.headers_ready:
            return

        endpoints = (
            ("/face-logs?page=1&page_size=20", "Face Logs"),
            ("/helmet-logs?page=1&page_size=20", "Helmet Logs"),
            ("/mask-logs?page=1&page_size=20", "Mask Logs"),
        )
        for endpoint, name in endpoints:
            with self.client.get(endpoint, catch_response=True, name=name) as response:
                if response.status_code != 200:
                    response.failure(f"Unexpected status {response.status_code}")
                    continue
                payload = response.json()
                if "logs" not in payload:
                    response.failure("Missing logs in response")


@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    print("=== Performance Test Started ===")
    print(f"Target host: {environment.host}")
    print(f"Login email: {LOGIN_EMAIL}")
    print("Testing endpoints: /recognize-face, /helmet-detect, /mask-detect, logs")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    print("=== Performance Test Completed ===")
    stats = environment.runner.stats
    print(f"Total requests: {stats.total.num_requests}")
    print(f"Total failures: {stats.total.num_failures}")