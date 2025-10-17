// scripts/set-admin-role.ts
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const run = async () => {
  const uid = process.argv[2]
  if (!uid) throw new Error('Usage: ts-node scripts/set-admin-role.ts <UID>')

  initializeApp({ credential: applicationDefault() })

  await getAuth().setCustomUserClaims(uid, { role: 'admin' })
  console.log(`Set admin role for ${uid}`)
}

run().catch((error) => {
  console.error('Failed to set admin role', error)
  process.exitCode = 1
})
