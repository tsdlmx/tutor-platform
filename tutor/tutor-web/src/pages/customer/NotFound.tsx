import { Link } from 'react-router-dom';
import { Compass, Home, Search } from 'lucide-react';
import { Button, Card, CardContent } from '@/components/ui';

/**
 * 客户侧 404
 *
 * 站点根路径属于客户，所以客户走错 URL 时不应该看到管理后台那套 404
 * （它的按钮指向 /admin/dashboard，会把客户引到后台登录页）。
 * 管理后台自己还有一份 404（pages/admin/NotFound.tsx），在 /admin/** 内仍然用它。
 */
export default function CustomerNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-16 sm:py-24">
      <Card className="w-full">
        <CardContent className="flex flex-col items-center px-6 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Compass className="h-7 w-7" />
          </span>

          <p className="tabular mt-5 text-4xl font-semibold tracking-tight">404</p>
          <h1 className="mt-2 text-base font-semibold tracking-tight">这个页面不存在</h1>
          <p className="mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
            链接可能已经失效，或者地址输入有误。你可以回到首页重新开始，
            也可以直接去看看平台上已经发布的老师和需求。
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button asChild>
              <Link to="/">
                <Home className="h-4 w-4" />
                回到首页
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/tutors">
                <Search className="h-4 w-4" />
                浏览家教
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
