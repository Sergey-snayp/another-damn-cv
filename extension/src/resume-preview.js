let objectUrl;
try {
  const { profile } = await chrome.storage.local.get('profile');
  if (!profile?.resumeDataUrl || !/^data:application\/pdf[;,]/i.test(profile.resumeDataUrl)) throw new Error('No local PDF is attached. Choose one in the extension’s Resume tab.');
  const response = await fetch(profile.resumeDataUrl), blob = await response.blob();
  if (await blob.slice(0, 5).text() !== '%PDF-') throw new Error('This file is not a valid PDF. Attach the PDF again in the Resume tab.');
  document.getElementById('filename').textContent = profile.resumeFileName || 'Resume.pdf';
  objectUrl = URL.createObjectURL(blob);
  const pdf = document.getElementById('pdf'); pdf.src = objectUrl; pdf.hidden = false;
  document.getElementById('preview-status').hidden = true;
} catch (error) { document.getElementById('preview-status').textContent = error.message; }
addEventListener('pagehide', () => { if (objectUrl) URL.revokeObjectURL(objectUrl); });
