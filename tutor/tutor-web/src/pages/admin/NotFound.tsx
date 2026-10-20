import { Link } from 'react-router-dom';
import { Button, Card } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="flex max-w-sm flex-col items-center gap-3 p-8 text-center">
        <p className="tabular text-3xl font-semibold tracking-tight text-muted-foreground">404</p>
        <p className="text-sm font-medium">页面不存在</p>
        <p className="text-xs text-muted-foreground">访问的地址没有对应的页面，可能已被移动或删除。</p>
        <div className="mt-2 flex items-center gap-2">
          <Button asChild size="sm">
            <Link to="/admin/dashboard">回到数据概览</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/tutors">前往客户端</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
