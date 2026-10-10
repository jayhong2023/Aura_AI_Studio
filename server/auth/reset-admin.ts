import { randomBytes } from 'node:crypto'
import { listUsers, setUserPassword } from './store'

const admin = listUsers().find(
  (user) => user.username === (process.env.ADMIN_USERNAME || 'admin'),
)
if (!admin) throw new Error('管理员账号不存在')

const temporaryPassword = randomBytes(18).toString('base64url')
await setUserPassword(admin.id, temporaryPassword, true)

console.log(`ADMIN_USERNAME=${admin.username}`)
console.log(`TEMP_PASSWORD=${temporaryPassword}`)
console.log('首次登录后必须立即修改密码')
