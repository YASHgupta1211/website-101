"""Isolated API/worker checks; no real provider calls or development data writes."""
import asyncio
import gc
import json
import os
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import httpx
from PIL import Image


class CatalogFlowTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        # The current router initializes mock storage at import time.
        cls.import_directory = tempfile.TemporaryDirectory()
        original_directory = Path.cwd()
        try:
            os.chdir(cls.import_directory.name)
            from app import main, worker
            from app.routers import whatsapp
            cls.main = main
            cls.worker = worker
            cls.whatsapp = whatsapp
            from app.auth import AuthUser, require_user
            cls.AuthUser = AuthUser
            cls.require_user = staticmethod(require_user)
        finally:
            os.chdir(original_directory)

    @classmethod
    def tearDownClass(cls):
        gc.collect()
        cls.import_directory.cleanup()

    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        root = Path(self.directory.name)
        self.patches = [
            patch.object(self.main, 'DB_PATH', root / 'jobs.db'),
            patch.object(self.worker, 'DB_PATH', root / 'jobs.db'),
            patch.object(self.whatsapp, 'DB_PATH', root / 'jobs.db'),
            patch.object(self.main, 'UPLOAD_DIR', root / 'uploads'),
            patch.object(self.whatsapp, 'MOCK_UPLOAD_DIR', root / 'uploads'),
            patch.object(self.worker, 'GENERATED_DIR', root / 'generated'),
            patch.object(self.main, 'GENERATED_DIR', root / 'generated'),
            patch.object(self.worker, 'MOCK_GENERATION', True),
        ]
        queue = asyncio.Queue()
        for module in (self.main, self.worker, self.whatsapp):
            self.patches.append(patch.object(module, 'job_queue', queue))
        for item in self.patches:
            item.start()
        self.main.UPLOAD_DIR.mkdir()
        self.user = self.AuthUser(uid='seller-a', email='a@example.com', name='Seller A', email_verified=True)
        self.main.app.dependency_overrides[self.require_user] = lambda: self.user
        self.main.init_db()
        self.whatsapp.init_mock_sessions()
        image = BytesIO()
        Image.new('RGB', (16, 16), 'white').save(image, format='PNG')
        self.image = image.getvalue()
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=self.main.app),
            base_url='http://test',
        )

    async def asyncTearDown(self):
        await self.client.aclose()
        self.main.app.dependency_overrides.clear()
        for item in reversed(self.patches):
            item.stop()
        gc.collect()
        self.directory.cleanup()

    async def submit(self, data=None):
        return await self.client.post(
            '/jobs', data=data or {},
            files={'image': ('photo.png', self.image, 'image/png')},
        )

    async def run_job(self, job_id):
        self.assertEqual(await self.worker.job_queue.get(), job_id)
        try:
            await self.worker.process_job(job_id)
        finally:
            self.worker.job_queue.task_done()

    async def test_health_and_background_presets(self):
        self.assertEqual((await self.client.get('/health')).json(), {'status': 'ok'})
        for style, background in [('ivory', 'Soft ivory'), ('sand', 'Warm sand'), ('midnight', 'Midnight')]:
            response = await self.submit({'style': style})
            self.assertEqual(response.status_code, 202, response.text)
            job_id = response.json()['job_id']
            await self.run_job(job_id)
            _, preferences = self.worker.get_job_data(job_id)
            self.assertEqual(preferences, {'model_type': 'Product only', 'background': background})
            prompt = (self.worker.GENERATED_DIR / f'{job_id}.txt').read_text()
            self.assertIn(f'- Background: {background}', prompt)
            self.assertNotIn('MODEL AND STYLING:', prompt)
            self.assertEqual((await self.client.get(f'/jobs/{job_id}')).json()['status'], 'mock_completed')
            self.assertEqual((await self.client.get(f'/jobs/{job_id}/result')).status_code, 409)

    async def test_model_preferences_reach_prompt(self):
        for model in ('Female', 'Male'):
            preferences = {'model_type': model, 'age_range': 'Mature adult', 'skin_tone': 'Deep', 'outfit': 'Formal', 'background': 'Wedding'}
            response = await self.submit({'preferences': json.dumps(preferences)})
            self.assertEqual(response.status_code, 202, response.text)
            job_id = response.json()['job_id']
            await self.run_job(job_id)
            self.assertEqual(self.worker.get_job_data(job_id)[1], preferences)
            prompt = (self.worker.GENERATED_DIR / f'{job_id}.txt').read_text(encoding='utf-8')
            for value in preferences.values():
                self.assertIn(value, prompt)
            self.assertIn('MODEL AND STYLING:', prompt)

    async def test_product_only_removes_hidden_model_answers(self):
        preferences = {'model_type': 'Product only', 'background': 'Warm sand', 'age_range': 'Mature adult', 'outfit': 'Formal'}
        response = await self.submit({'preferences': json.dumps(preferences)})
        self.assertEqual(response.status_code, 202)
        self.assertEqual(self.worker.get_job_data(response.json()['job_id'])[1], {'model_type': 'Product only', 'background': 'Warm sand'})

    async def test_bad_preferences_do_not_create_jobs(self):
        for preferences in ['not-json', 'null', '[]', '{"model_type":"Child"}', '{"background":"unexpected"}', '{"outfit":"Custom"}', '{"extra":"ignored?"}']:
            response = await self.submit({'preferences': preferences})
            self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual((await self.submit({'style': 'invalid'})).status_code, 400)
        self.assertTrue(self.worker.job_queue.empty())
        self.assertEqual(list(self.main.UPLOAD_DIR.iterdir()), [])

    async def test_upload_validation(self):
        for contents, content_type, expected in [(b'', 'image/png', 400), (b'not an image', 'image/png', 400), (self.image, 'text/plain', 400), (b'x' * (self.main.MAX_FILE_SIZE + 1), 'image/png', 413)]:
            response = await self.client.post('/jobs', files={'image': ('photo.png', contents, content_type)})
            self.assertEqual(response.status_code, expected, response.text)

    async def test_source_recovery_and_completed_result(self):
        response = await self.submit()
        job_id = response.json()['job_id']
        source = await self.client.get(f'/jobs/{job_id}/source')
        self.assertEqual(source.status_code, 200)
        with Image.open(BytesIO(source.content)) as image:
            self.assertEqual(image.size, (16, 16))

        def fake_generate(input_path, output_path, preferences):
            self.assertTrue(Path(input_path).is_file())
            Path(output_path).parent.mkdir(exist_ok=True)
            Path(output_path).write_bytes(self.image)

        with patch.object(self.worker, 'MOCK_GENERATION', False), patch.object(self.worker, 'generate_catalog_image', fake_generate):
            await self.run_job(job_id)
        self.assertEqual((await self.client.get(f'/jobs/{job_id}')).json()['status'], 'completed')
        self.assertEqual((await self.client.get(f'/jobs/{job_id}/result')).content, self.image)
        self.assertEqual((await self.client.get('/jobs/missing/source')).status_code, 404)
        Path(self.worker.get_job_data(job_id)[0]).unlink()
        self.assertEqual((await self.client.get(f'/jobs/{job_id}/source')).status_code, 404)

    async def test_worker_failure_is_terminal(self):
        job_id = (await self.submit()).json()['job_id']
        with patch.object(self.worker, 'MOCK_GENERATION', False), patch.object(self.worker, 'generate_catalog_image', side_effect=RuntimeError('provider unavailable')):
            await self.run_job(job_id)
        self.assertEqual((await self.client.get(f'/jobs/{job_id}')).json()['status'], 'failed')

    async def test_whatsapp_mock_still_creates_product_job(self):
        prefix = '/webhooks/whatsapp/mock'
        session_id = (await self.client.post(f'{prefix}/start')).json()['session_id']
        response = await self.client.post(f'{prefix}/{session_id}/photo', files={'image': ('photo.png', self.image, 'image/png')})
        self.assertEqual(response.status_code, 200, response.text)
        for answer in ['Product only', 'Young adult', 'Choose for me', 'Traditional', 'Minimal']:
            response = await self.client.post(f'{prefix}/{session_id}/message', json={'message': answer})
            self.assertEqual(response.status_code, 200, response.text)
        response = await self.client.post(f'{prefix}/{session_id}/create-job')
        self.assertEqual(response.status_code, 201, response.text)
        job_id = response.json()['job_id']
        await self.run_job(job_id)
        prompt = (self.worker.GENERATED_DIR / f'{job_id}.txt').read_text()
        self.assertIn('- Background: Minimal', prompt)
        self.assertNotIn('MODEL AND STYLING:', prompt)

    async def test_anonymous_requests_are_denied(self):
        self.main.app.dependency_overrides.clear()
        for path in ['/me', '/jobs', '/jobs/unknown', '/jobs/unknown/source', '/jobs/unknown/result']:
            response = await self.client.get(path)
            self.assertEqual(response.status_code, 401, response.text)
        self.assertEqual((await self.submit()).status_code, 401)
        self.assertEqual((await self.client.post('/webhooks/whatsapp/mock/start')).status_code, 401)
        self.assertEqual((await self.client.get('/health')).status_code, 200)

    async def test_user_cannot_access_another_users_jobs(self):
        job_id = (await self.submit()).json()['job_id']
        owner_history = await self.client.get('/jobs')
        self.assertEqual(owner_history.json()[0]['job_id'], job_id)
        self.assertEqual(owner_history.headers['cache-control'], 'private, no-store')
        self.user = self.AuthUser(uid='seller-b', email='b@example.com', email_verified=True)
        self.assertEqual((await self.client.get('/jobs')).json(), [])
        for suffix in ['', '/source', '/result']:
            response = await self.client.get(f'/jobs/{job_id}{suffix}')
            self.assertEqual(response.status_code, 404, response.text)

    async def test_unverified_email_cannot_use_generation(self):
        self.user = self.AuthUser(uid='unverified', email='new@example.com')
        self.assertEqual((await self.client.get('/me')).status_code, 200)
        self.assertEqual((await self.client.get('/jobs')).status_code, 403)
        self.assertEqual((await self.submit()).status_code, 403)
        self.assertTrue(self.worker.job_queue.empty())

    async def test_phone_account_can_use_generation(self):
        self.user = self.AuthUser(uid='phone-user', phone='+919876543210')
        response = await self.submit()
        self.assertEqual(response.status_code, 202, response.text)
        self.assertEqual((await self.client.get('/me')).json()['phone'], '+919876543210')

    async def test_profiles_are_account_scoped(self):
        response = await self.client.put('/me', json={'name': 'Alice', 'business': 'Alice Jewels'})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['email'], 'a@example.com')
        self.user = self.AuthUser(uid='seller-b', email='b@example.com', email_verified=True)
        self.assertNotEqual((await self.client.get('/me')).json()['name'], 'Alice')
        await self.client.put('/me', json={'name': 'Bob', 'business': 'Bob Jewels'})
        self.user = self.AuthUser(uid='seller-a', email='a@example.com', email_verified=True)
        self.assertEqual((await self.client.get('/me')).json()['business'], 'Alice Jewels')
        self.assertEqual((await self.client.put('/me', json={'name': 'x' * 81, 'business': ''})).status_code, 422)

    async def test_legacy_jobs_are_preserved_but_not_assigned_to_a_signin(self):
        import sqlite3
        from contextlib import closing
        with closing(sqlite3.connect(self.main.DB_PATH)) as conn, conn:
            conn.execute('DROP TABLE jobs')
            conn.execute('CREATE TABLE jobs (job_id TEXT PRIMARY KEY, status TEXT NOT NULL, image_path TEXT NOT NULL)')
            conn.execute("INSERT INTO jobs VALUES ('legacy', 'completed', 'legacy.png')")
        self.main.init_db()
        self.main.init_db()
        with closing(sqlite3.connect(self.main.DB_PATH)) as conn:
            row = conn.execute('SELECT job_id, status, image_path, owner_id FROM jobs').fetchone()
            self.assertEqual(row, ('legacy', 'completed', 'legacy.png', None))
        self.assertEqual((await self.client.get('/jobs')).json(), [])
        self.assertEqual((await self.client.get('/jobs/legacy')).status_code, 404)

    async def test_mock_sessions_are_private_and_disabled_in_production(self):
        prefix = '/webhooks/whatsapp/mock'
        session_id = (await self.client.post(f'{prefix}/start')).json()['session_id']
        self.user = self.AuthUser(uid='seller-b', email_verified=True)
        self.assertEqual((await self.client.get(f'{prefix}/{session_id}')).status_code, 404)
        self.assertEqual((await self.client.post(f'{prefix}/{session_id}/create-job')).status_code, 404)
        self.assertEqual((await self.client.post(f'{prefix}/{session_id}/message', json={'message': 'Female'})).status_code, 404)
        with patch.dict(os.environ, {'APP_ENV': 'production'}):
            self.assertEqual((await self.client.post(f'{prefix}/start')).status_code, 404)

    async def test_tokens_are_verified_by_firebase_not_decoded_without_validation(self):
        from app import auth as auth_module
        self.main.app.dependency_overrides.clear()
        claims = {'uid': 'firebase-user', 'email': 'verified@example.com', 'email_verified': True}
        with patch.object(auth_module, 'firebase_app', return_value='app'), patch.object(auth_module.auth, 'verify_id_token', return_value=claims) as verify:
            response = await self.client.get('/me', headers={'Authorization': 'Bearer signed-token'})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()['uid'], 'firebase-user')
            verify.assert_called_once_with('signed-token', app='app', check_revoked=True, clock_skew_seconds=30)
        for error in [ValueError('bad signature'), auth_module.auth.RevokedIdTokenError('revoked'), auth_module.auth.UserDisabledError('disabled')]:
            with patch.object(auth_module, 'firebase_app', return_value='app'), patch.object(auth_module.auth, 'verify_id_token', side_effect=error):
                self.assertEqual((await self.client.get('/jobs', headers={'Authorization': 'Bearer invalid'})).status_code, 401)

    async def test_missing_auth_config_fails_closed(self):
        from app import auth as auth_module
        self.main.app.dependency_overrides.clear()
        auth_module.firebase_app.cache_clear()
        try:
            with patch.dict(os.environ, {'FIREBASE_PROJECT_ID': ''}):
                response = await self.client.get('/jobs', headers={'Authorization': 'Bearer token'})
                self.assertEqual(response.status_code, 503, response.text)
        finally:
            auth_module.firebase_app.cache_clear()

    async def test_production_rejects_emulator_configuration(self):
        from app import auth as auth_module
        self.main.app.dependency_overrides.clear()
        auth_module.firebase_app.cache_clear()
        try:
            with patch.dict(os.environ, {
                'APP_ENV': 'production', 'FIREBASE_PROJECT_ID': 'demo-jewel-studio',
                'FIREBASE_AUTH_EMULATOR_HOST': '127.0.0.1:9099',
            }):
                response = await self.client.get('/jobs', headers={'Authorization': 'Bearer test-token'})
                self.assertEqual(response.status_code, 503, response.text)
        finally:
            auth_module.firebase_app.cache_clear()


if __name__ == '__main__':
    unittest.main()
