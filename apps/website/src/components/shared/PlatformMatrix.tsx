import { Check, Minus } from "lucide-react";
import { platforms } from "../../content/site";

export function PlatformMatrix() {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
      <table className="w-full min-w-[540px] border-collapse text-left text-sm">
        <thead>
          <tr className="text-white/60">
            <th className="px-4 py-3.5 font-semibold sm:px-5 sm:py-4">Site</th>
            <th className="px-4 py-3.5 text-center font-semibold sm:px-5 sm:py-4">
              Live detection
            </th>
            <th className="px-4 py-3.5 text-center font-semibold sm:px-5 sm:py-4">
              Recording
            </th>
            <th className="px-4 py-3.5 text-center font-semibold sm:px-5 sm:py-4">
              Downloads
            </th>
          </tr>
        </thead>
        <tbody>
          {platforms.map((platform) => (
            <tr
              key={platform.name}
              className="border-t border-white/5 transition-colors hover:bg-white/[0.03]"
            >
              <td className="px-4 py-3.5 font-medium whitespace-nowrap text-white sm:px-5 sm:py-4">
                {platform.name}
              </td>
              {(
                [
                  platform.live,
                  platform.recording,
                  platform.downloads,
                ] as const
              ).map((supported, i) => (
                <td
                  key={i}
                  className="px-4 py-3.5 text-center sm:px-5 sm:py-4"
                >
                  {supported ? (
                    <Check className="mx-auto h-4 w-4 text-white" />
                  ) : (
                    <Minus className="mx-auto h-4 w-4 text-white/30" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
