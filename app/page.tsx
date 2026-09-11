import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 flex items-center justify-center bg-gray-50 p-6">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">2026 SK임팩트부스터 데이 럭키드로우</h1>
        <p className="text-gray-500 text-sm">내부 개발용 진입 페이지</p>
        <div className="flex flex-col gap-2 mt-6">
          <Link href="/join" className="border rounded-lg px-4 py-2 hover:bg-gray-100">
            /join — 참가자 화면 (QR 연결 대상)
          </Link>
          <Link href="/screen" className="border rounded-lg px-4 py-2 hover:bg-gray-100">
            /screen — 무대 스크린 화면
          </Link>
          <Link href="/admin" className="border rounded-lg px-4 py-2 hover:bg-gray-100">
            /admin — 관리자 관제판
          </Link>
        </div>
      </div>
    </main>
  );
}
