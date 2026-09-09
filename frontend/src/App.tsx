import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import Login from './pages/Login'
import Admin from './pages/Admin'
import UserCenter from './pages/UserCenter'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/user-center" element={<UserCenter />} />
    </Routes>
  )
}
