import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import ChatPanel from './components/ChatPanel'
import Home from './pages/Home'
import Products from './pages/Products'
import ProductDetail from './pages/ProductDetail'
import About from './pages/About'
import VisitUs from './pages/VisitUs'
import SizeGuide from './pages/SizeGuide'
import Login from './pages/Login'
import CreateAccount from './pages/CreateAccount'
import NotFound from './pages/NotFound'
import AuthProvider from './auth/AuthProvider'
import ScrollToTop from './components/ScrollToTop'
import PasswordBanner from './components/PasswordBanner'
import ChangePassword from './pages/ChangePassword'
import Profile from './pages/Profile'
import ForgotPassword from './pages/ForgotPassword'
import ScrollReveal from './components/ScrollReveal'
import BagProvider from './bag/BagProvider'
import SeasonProvider from './season/SeasonProvider'
import WishlistProvider from './wishlist/WishlistProvider'
import Bag from './pages/Bag'
import Checkout from './pages/Checkout'

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <ScrollReveal />
      <SeasonProvider>
      <AuthProvider>
        <BagProvider>
        <WishlistProvider>
        <Navbar />
        <PasswordBanner />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/:productId" element={<ProductDetail />} />
          <Route path="/about" element={<About />} />
          <Route path="/visit" element={<VisitUs />} />
          <Route path="/size-guide" element={<SizeGuide />} />
          <Route path="/login" element={<Login />} />
          <Route path="/create-account" element={<CreateAccount />} />
          <Route path="/account/password" element={<ChangePassword />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/bag" element={<Bag />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Footer />
        <ChatPanel />
        </WishlistProvider>
        </BagProvider>
      </AuthProvider>
      </SeasonProvider>
    </BrowserRouter>
  )
}
