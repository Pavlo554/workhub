const CLOUD_NAME = 'doxuyjou2'
const UPLOAD_PRESET = 'workhub'

export async function uploadToCloudinary(file) {
  const form = new FormData()
  form.append('file', file)
  form.append('upload_preset', UPLOAD_PRESET)

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error('Помилка завантаження файлу')
  const data = await res.json()

  return {
    name: file.name,
    url: data.secure_url,
    storagePath: data.public_id,
    type: file.type.startsWith('image/') ? 'image' : 'file',
  }
}
