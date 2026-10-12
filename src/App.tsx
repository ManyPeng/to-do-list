import { Component, Suspense, lazy, type ErrorInfo, type ReactNode } from 'react'
import { NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { localDateSchema, todayLocalDate } from './domain'
import './App.css'

const TaskBoard = lazy(() => import('./features/board/TaskBoard').then((module) => ({ default: module.TaskBoard })))
const HistoryPage = lazy(() => import('./features/history/HistoryPage').then((module) => ({ default: module.HistoryPage })))
const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const TemplatePage = lazy(() => import('./features/templates/TemplatePage').then((module) => ({ default: module.TemplatePage })))

type ErrorBoundaryProps = { children: ReactNode }
type ErrorBoundaryState = { hasError: boolean }

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('应用渲染失败', error, info)
  }

  render() {
    if (this.state.hasError) {
      return <main className="error-state"><h1>页面暂时无法显示</h1><p>请刷新页面后重试。</p></main>
    }
    return this.props.children
  }
}

const pageNames: Record<string, string> = {
  today: '今天',
  templates: '固定任务',
  history: '完成历史',
  settings: '设置',
}

function TodayPage() {
  return <TaskBoard date={todayLocalDate()} />
}

function DayPage() {
  const { date } = useParams()
  const parsedDate = localDateSchema.safeParse(date)
  if (!parsedDate.success) {
    return <section className="error-state"><h1>日期无效</h1><p>请使用 YYYY-MM-DD 格式访问指定日期。</p></section>
  }
  return <TaskBoard date={parsedDate.data} />
}

function AppShell() {
  return (
    <div className="app-shell">
      <main className="app-content">
        <Suspense fallback={<div className="board-message">正在打开页面…</div>}>
          <Routes>
            <Route path="/today" element={<TodayPage />} />
            <Route path="/day/:date" element={<DayPage />} />
            <Route path="/templates" element={<TemplatePage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Routes>
        </Suspense>
      </main>
      <nav className="bottom-nav" aria-label="主导航">
        {Object.entries(pageNames).map(([path, label]) => (
          <NavLink key={path} to={`/${path}`}>{label}</NavLink>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  return <ErrorBoundary><AppShell /></ErrorBoundary>
}
