export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      reservas: {
        Row: {
          cia_aerea: string | null;
          codigo_reserva: string | null;
          created_at: string;
          data_chegada: string | null;
          data_saida: string | null;
          data_voo_ida: string | null;
          data_voo_volta: string | null;
          destino: string | null;
          hora_voo_ida: string | null;
          hora_voo_volta: string | null;
          horario_voo_chegada: string | null;
          horario_voo_saida: string | null;
          hotel: string | null;
          id: string;
          ident: string | null;
          localizador: string | null;
          nome_pax: string | null;
          numero_reserva: string | null;
          obs: string | null;
          operadora: string | null;
          origem: string | null;
          passageiro: string | null;
          regime: string | null;
          status: string | null;
          tipo_pax: string | null;
          user_id: string | null;
          voo_chegada: string | null;
          voo_saida: string | null;
        };
        Insert: {
          cia_aerea?: string | null;
          codigo_reserva?: string | null;
          created_at?: string;
          data_chegada?: string | null;
          data_saida?: string | null;
          data_voo_ida?: string | null;
          data_voo_volta?: string | null;
          destino?: string | null;
          hora_voo_ida?: string | null;
          hora_voo_volta?: string | null;
          horario_voo_chegada?: string | null;
          horario_voo_saida?: string | null;
          hotel?: string | null;
          id?: string;
          ident?: string | null;
          localizador?: string | null;
          nome_pax?: string | null;
          numero_reserva?: string | null;
          obs?: string | null;
          operadora?: string | null;
          origem?: string | null;
          passageiro?: string | null;
          regime?: string | null;
          status?: string | null;
          tipo_pax?: string | null;
          user_id?: string | null;
          voo_chegada?: string | null;
          voo_saida?: string | null;
        };
        Update: {
          cia_aerea?: string | null;
          codigo_reserva?: string | null;
          created_at?: string;
          data_chegada?: string | null;
          data_saida?: string | null;
          data_voo_ida?: string | null;
          data_voo_volta?: string | null;
          destino?: string | null;
          hora_voo_ida?: string | null;
          hora_voo_volta?: string | null;
          horario_voo_chegada?: string | null;
          horario_voo_saida?: string | null;
          hotel?: string | null;
          id?: string;
          ident?: string | null;
          localizador?: string | null;
          nome_pax?: string | null;
          numero_reserva?: string | null;
          obs?: string | null;
          operadora?: string | null;
          origem?: string | null;
          passageiro?: string | null;
          regime?: string | null;
          status?: string | null;
          tipo_pax?: string | null;
          user_id?: string | null;
          voo_chegada?: string | null;
          voo_saida?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "reservas_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      passeios: {
        Row: {
          created_at: string;
          data_passeio: string;
          descricao: string | null;
          id: string;
          id_externo: string;
          reserva_id: string | null;
          tipo_passeio: Database['public']['Enums']['passeio_tipo'];
        };
        Insert: {
          created_at?: string;
          data_passeio: string;
          descricao?: string | null;
          id?: string;
          id_externo: string;
          reserva_id?: string | null;
          tipo_passeio: Database['public']['Enums']['passeio_tipo'];
        };
        Update: {
          created_at?: string;
          data_passeio?: string;
          descricao?: string | null;
          id?: string;
          id_externo?: string;
          reserva_id?: string | null;
          tipo_passeio?: Database['public']['Enums']['passeio_tipo'];
        };
        Relationships: [
          {
            foreignKeyName: "passeios_reserva_id_fkey";
            columns: ["reserva_id"];
            referencedRelation: "reservas";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {};
    Functions: {};
    Enums: {
      passeio_tipo: 'AR' | 'TR' | 'CA' | 'RF' | 'FL' | 'OB' | 'OB_COM_QUADRADO';
    };
    CompositeTypes: {};
  };
};

export type Passeio = Database['public']['Tables']['passeios']['Row'];
