import { requireUserId } from "@/lib/session";
import { listSecrets } from "@/data/secrets";
import { PageHeader } from "@/components/shell/PageHeader";
import { formatRelative } from "@/lib/status";
import {
  DeleteSecretButton,
  NewSecretForm,
} from "@/components/secrets/SecretControls";

/**
 * Names and timestamps only, on purpose — see `data/secrets.ts`. There is no
 * "reveal" button anywhere in this page because there is no function
 * anywhere in the app that would give this page a value to reveal.
 */
export default async function SecretsPage() {
  const userId = await requireUserId();
  const secrets = await listSecrets(userId);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon="Settings"
        title="Secrets"
        tabs={[
          { href: "/workflows", label: "All", icon: "LayoutGrid" },
          { href: "/runs", label: "Runs", icon: "History" },
          { href: "/nodes", label: "Nodes", icon: "Boxes" },
          { href: "/schedules", label: "Schedules", icon: "Clock" },
          { href: "/secrets", label: "Secrets", icon: "Settings" },
        ]}
        active="/secrets"
        meta={
          <span>
            {secrets.length} secret{secrets.length === 1 ? "" : "s"}
          </span>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-5">
          <NewSecretForm />

          {secrets.length === 0 ? (
            <div className="mt-8 text-center">
              <h2 className="text-ink font-serif text-[19px] italic">
                Nothing stored yet.
              </h2>
              <p className="text-ink-soft mx-auto mt-2 max-w-sm text-[13px]">
                An API key or token you&rsquo;d otherwise have to paste into a
                node&rsquo;s config in plaintext — save it here instead and
                reference it as <code>{`{{secret.NAME}}`}</code>.
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-1.5">
              {secrets.map((secret) => (
                <li
                  key={secret.id}
                  className="border-line flex items-center gap-2.5 rounded-lg border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-ink truncate font-mono text-[13px] font-bold">
                      {secret.name}
                    </p>
                    <p className="text-ink-faint text-[11.5px]">
                      updated {formatRelative(secret.updatedAt)}
                    </p>
                  </div>
                  <DeleteSecretButton secretId={secret.id} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
