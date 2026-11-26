import unittest
from unittest.mock import patch

from fastapi import HTTPException

import file_storage


class FakeBlob:
    def __init__(self, bucket, key):
        self.bucket, self.key, self.cache_control = bucket, key, None

    def upload_from_string(self, data, content_type, if_generation_match, timeout):
        if if_generation_match == 0 and self.key in self.bucket.objects:
            raise RuntimeError("precondition failed")
        self.bucket.objects[self.key] = (data, content_type, self.cache_control)

    def delete(self, timeout):
        from google.api_core.exceptions import NotFound
        if self.key not in self.bucket.objects:
            raise NotFound("missing")
        del self.bucket.objects[self.key]

    def download_as_bytes(self, timeout):
        return self.bucket.objects[self.key][0]

    def generate_signed_url(self, version, expiration, method, response_disposition):
        self.bucket.signed.append((self.key, version, expiration, method, response_disposition))
        return f"https://signed/{self.key}"


class FakeBucket:
    def __init__(self):
        self.objects, self.signed = {}, []

    def blob(self, key):
        return FakeBlob(self, key)


class FileStorageTests(unittest.TestCase):
    def setUp(self):
        self.bucket = FakeBucket()
        p = patch("file_storage._bucket", return_value=self.bucket); p.start(); self.addCleanup(p.stop)

    def test_put_is_private_and_never_overwrites(self):
        file_storage.put("student-documents/s1/d1", b"%PDF", "application/pdf")
        self.assertEqual(self.bucket.objects["student-documents/s1/d1"][2], "private, max-age=0")
        with self.assertRaises(HTTPException) as caught:
            file_storage.put("student-documents/s1/d1", b"x", "application/pdf")
        self.assertEqual(caught.exception.status_code, 502)

    def test_signed_link_is_short_lived_v4_with_download_name(self):
        file_storage.put("k/doc", b"x", "application/pdf")
        file_storage.signed_url("k/doc", "Speech report.pdf")
        key, version, expiration, method, disposition = self.bucket.signed[0]
        self.assertEqual((version, method, expiration.total_seconds()), ("v4", "GET", 300))
        self.assertEqual(disposition, "attachment; filename*=UTF-8''Speech%20report.pdf")

    def test_delete_of_missing_object_is_not_an_error(self):
        file_storage.delete("k/missing")

    def test_rejects_traversal_and_odd_keys(self):
        for key in ("../secret", "a/../b", "/abs", "", "a b"):
            with self.assertRaises(HTTPException):
                file_storage.put(key, b"x", "text/plain")

    def test_read_enforces_size(self):
        file_storage.put("k/v.mp4", b"12345", "video/mp4")
        self.assertEqual(file_storage.read("k/v.mp4", 10), b"12345")
        with self.assertRaises(HTTPException):
            file_storage.read("k/v.mp4", 3)


if __name__ == "__main__":
    unittest.main()
