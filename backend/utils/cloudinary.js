// Cloudinary helpers shared across routes.

// Derive a Cloudinary public_id from a download/secure URL.
// Handles both versioned (…/upload/v123/studyvault/abc.pdf) and
// unversioned (…/upload/studyvault/abc.pdf) URLs.
function publicIdFromUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/');
    const uploadIdx = parts.lastIndexOf('upload');
    if (uploadIdx === -1) return null;
    let rest = parts.slice(uploadIdx + 1);
    if (rest.length && /^v\d+$/.test(rest[0])) rest = rest.slice(1);
    if (!rest.length) return null;
    const last = rest[rest.length - 1];
    rest[rest.length - 1] = last.replace(/\.[A-Za-z0-9]+$/, '');
    const publicId = rest.join('/');
    return publicId || null;
  } catch (_err) {
    return null;
  }
}

// Best-effort deletion of the file backing a paper. Never throws.
async function destroyPaperFile(cloudinary, paperData) {
  if (!cloudinary || !paperData) return;
  const publicId = paperData.publicId || publicIdFromUrl(paperData.downloadURL);
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error(`Cloudinary delete failed (${publicId}):`, err.message);
  }
}

module.exports = { publicIdFromUrl, destroyPaperFile };
