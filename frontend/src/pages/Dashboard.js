import React from 'react';
import './Dashboard.css';
import { AiOutlineProduct, AiFillDollarCircle, AiOutlineCar, AiOutlineMail   } from "react-icons/ai";

const Dashboard = () => {

  const menuitems = {
    "items" : [
      {"id": "1","icon":"AiOutlineProduct","name": "Producto","description":"Productos de venta "},
      {"id": "2","icon":"AiFillDollarCircle","name": "Finanzas","description":"Cuentas del Negocio "},
      {"id": "3","icon":"AiOutlineCar","name": "Transporte","description":"Entrega de Pedidos"},
      {"id": "4","icon":"AiOutlineMail","name": "Comunicacion","description":"Envio de correos"},
    ]
  }

  // Mapeo de iconos
  const iconMap = {
    AiOutlineProduct: AiOutlineProduct,
    AiFillDollarCircle: AiFillDollarCircle,
    AiOutlineCar: AiOutlineCar,
    AiOutlineMail: AiOutlineMail
  };

  return (
    <div className='dashboard-container'>
      {menuitems.items.map((item) => {
        const IconComponent = iconMap[item.icon];
        return (
          <div key={item.id} className='Icon'>
            <h3><IconComponent size={35} /></h3>
            <div className='Icon-text'>
              <p>{item.name}</p>
              <p>{item.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Dashboard;
