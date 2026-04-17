import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

type MyRouteProps {}

const Routes: React.FC<MyRoutesProps> = () => {
  return (
    <BrowserRouter>
        <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/login" element={<Login />} />
        </Routes>
    </BrowserRouter>
  )
}
