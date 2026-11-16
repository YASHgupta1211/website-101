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


if __name__ == '__main__':
    unittest.main()
