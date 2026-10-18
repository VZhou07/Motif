import { requestCameraGrant } from '../../../src/features/browser-access/grant-camera';

const status = document.getElementById('status')!;
document.getElementById('grant')!.addEventListener('click', () => {
  status.textContent = 'Waiting for the browser prompt...';
  void requestCameraGrant(navigator.mediaDevices).then((result) => { status.textContent = result.message; });
});
