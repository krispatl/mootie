
async function deleteFile(fileId) {
  console.log("[deleteFile]", fileId);
  const start = performance.now();

  try {
    const res = await fetch(`/api/delete-file?fileId=${encodeURIComponent(fileId)}`, {
      method: 'DELETE'
    });
    const json = await res.json();
    const elapsed = (performance.now() - start).toFixed(1);
    console.log("🧩 Full response body:", json);
    console.log("⏱️ Duration:", elapsed, "ms");

    if (json.success) {
      console.log("✅ File deleted successfully.");
      const el = document.querySelector(`[data-file-id="${fileId}"]`);
      if (el) el.remove();
    } else {
      console.error("❌ Delete failed:", json.error);
    }
  } catch (e) {
    console.error("❌ Exception during delete:", e);
  }
}
