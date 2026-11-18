"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { MenuTrigger } from "@/components/action-menu";
import { Modal, ModalBody, ModalFooter } from "@/components/modal";
import { useFormAction } from "@/components/use-form-action";
import { resetMemberPassword } from "@/app/actions/teams";

/**
 * An admin gives a member who has forgotten their password a temporary one. The drawer
 * asks first, then shows the password once — it is stored only as a hash — to be handed
 * on in person or in a message. The member chooses their own at the next login.
 */
export function ResetPasswordButton({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const { state, pending, handleSubmit } = useFormAction(resetMemberPassword);
  const password = state?.ok ? state.note : undefined;

  return (
    <>
      <MenuTrigger variant="secondary" onClick={() => setOpen(true)}>
        Nulstil adgangskode
      </MenuTrigger>
      <Modal open={open} onClose={() => setOpen(false)} title={`Ny adgangskode til ${name}`} size="drawer">
        {password ? (
          <>
            <ModalBody>
              <p className="text-sm text-slate-600">Giv {name} denne midlertidige adgangskode. Den vises kun nu.</p>
              <p
                aria-label="Midlertidig adgangskode"
                className="my-4 rounded-lg bg-slate-100 py-3 text-center font-mono text-2xl tracking-widest text-slate-900 select-all"
              >
                {password}
              </p>
              <p className="text-sm text-slate-600">Ved næste login vælger {name} sin egen. Alle andre steder er logget ud.</p>
            </ModalBody>
            <ModalFooter>
              <Button type="button" onClick={() => setOpen(false)} className="w-full sm:w-auto">
                Færdig
              </Button>
            </ModalFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <input type="hidden" name="userId" value={userId} />
            <ModalBody>
              <p className="text-sm text-slate-600">
                {name} får en midlertidig adgangskode, som du giver videre, og bliver logget ud alle steder. Den gamle holder
                op med at virke.
              </p>
            </ModalBody>
            <ModalFooter>
              {state?.ok === false && (
                <p role="alert" className="mb-3 text-sm text-red-600">
                  {state.error}
                </p>
              )}
              <div className="flex gap-2 sm:justify-end">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)} className="flex-1 sm:flex-none">
                  Annuller
                </Button>
                <Button type="submit" disabled={pending} aria-busy={pending} className="flex-1 sm:flex-none">
                  Lav midlertidig kode
                </Button>
              </div>
            </ModalFooter>
          </form>
        )}
      </Modal>
    </>
  );
}
