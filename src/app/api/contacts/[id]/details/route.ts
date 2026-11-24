import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectToPostgres } from "@/lib/postgres";
import { captureException, logger, motivo } from "@/lib/logger";
import { updateContact } from "@/lib/repositories/contactRepo";
import { DEMO_MODE, dbUnavailableResponse } from "@/lib/demo";
import { requireUserPermission } from "@/lib/auth";

const contactDetailsSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(
      /^\d{1,9}$/,
      "El teléfono debe contener solo números y máximo 9 dígitos",
    )
    .or(z.literal(""))
    .nullable()
    .optional(),
  email: z
    .string()
    .trim()
    .email("Formato de correo electrónico inválido")
    .or(z.literal(""))
    .nullable()
    .optional(),
});

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await requireUserPermission(req, "write");
  if (denied) return denied;

  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: "ID de contacto requerido" },
        { status: 400 },
      );
    }

    const body = await req.json();
    const parsed = contactDetailsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Datos de contacto inválidos",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const payload = {
      phone: parsed.data.phone ? parsed.data.phone : null,
      email: parsed.data.email ? parsed.data.email : null,
    };

    const db = await connectToPostgres();
    if (!db) {
      if (DEMO_MODE) {
        return NextResponse.json({
          success: true,
          source: "demo",
          data: { id, ...payload },
        });
      }
      return dbUnavailableResponse();
    }

    const updated = await updateContact(db, id, payload);
    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Contacto no encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      source: "postgres",
      data: updated,
    });
  } catch (error: any) {
    const errorId = captureException(error, {
      route: "/api/contacts/[id]/details",
      method: "PUT",
    });
    logger.error("Error in PUT /api/contacts/[id]/details", {
      motivo: motivo(error),
    });
    return NextResponse.json(
      { success: false, error: "Error interno del servidor", errorId },
      { status: 500 },
    );
  }
}
