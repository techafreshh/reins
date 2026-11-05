const SKELETON_VERSION = "0.1.0";

export function meta() {
  return [{ title: "Reins skeleton" }];
}

export default function IndexRoute() {
  return (
    <main>
      <h1>Reins skeleton live</h1>
      <p>skeleton v{SKELETON_VERSION}</p>
      <nav>
        <a href="/home">Home</a> <a href="/chat">Chat</a>
      </nav>
    </main>
  );
}
